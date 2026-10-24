import asyncio
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.diagnostician import Diagnostician
from app.core.config import get_settings
from app.core.database import get_db, prune
from app.core.security import excerpt, redact
from app.integrations.gitlab import gitlab_client
from app.models.entities import Analysis, Message
from app.schemas.diagnosis import AnalysisOut, AnalyzeRequest, ChatRequest, PipelineDiagnosis
from app.services import demo, pipelines

router = APIRouter()
ai_slots = asyncio.Semaphore(2)


@router.get("/settings")
def settings():
    config = get_settings()
    return {
        "demo_mode": config.demo_mode,
        "gitlab_url": str(config.gitlab_url),
        "gitlab_configured": bool(config.gitlab_token),
        "llm_configured": bool(config.llm_api_key),
        "llm_model": config.llm_model,
        "retention_days": config.retention_days,
        "log_max_chars": config.log_max_chars,
        "auth_enabled": bool(config.app_api_key),
    }


@router.get("/connection")
async def connection():
    if get_settings().demo_mode:
        return {
            "connected": True,
            "source": "demo",
            "message": "Simulated connection; no external requests",
        }
    async with gitlab_client() as client:
        await client.projects()
    return {"connected": True, "source": "live", "message": "GitLab API reachable"}


@router.get("/projects")
async def projects(db: Session = Depends(get_db)):
    return await pipelines.connected(db)


@router.get("/projects/available")
async def available(page: int = Query(1, ge=1, le=1000), search: str = Query("", max_length=100)):
    if get_settings().demo_mode:
        return [
            {
                "id": 1,
                "name": "acme / storefront",
                "path_with_namespace": "acme/storefront",
                "web_url": "https://gitlab.com",
            }
        ]
    async with gitlab_client() as client:
        rows = await client.projects(page, search)
    return [
        {
            key: redact(str(row[key])) if key in ("name", "path_with_namespace") else row[key]
            for key in ("id", "name", "path_with_namespace", "web_url")
        }
        for row in rows
    ]


class ConnectRequest(BaseModel):
    gitlab_id: int = Field(gt=0)


@router.post("/projects", status_code=201)
async def connect(body: ConnectRequest, db: Session = Depends(get_db)):
    if get_settings().demo_mode:
        pipelines.ensure_demo(db)
        return demo.PROJECT
    return pipelines.project_out(await pipelines.connect(db, body.gitlab_id))


@router.get("/projects/{project_id}/pipelines")
async def pipeline_list(
    project_id: str, page: int = Query(1, ge=1, le=1000), db: Session = Depends(get_db)
):
    project = pipelines.connected_project(db, project_id)
    if project.source == "demo":
        return demo.pipelines() if page == 1 else []
    async with gitlab_client() as client:
        rows = await client.pipelines(project.gitlab_id, page)
    return [pipelines.pipeline_out(row) for row in rows]


@router.get("/projects/{project_id}/pipelines/{pipeline_id}")
async def pipeline_detail(project_id: str, pipeline_id: int, db: Session = Depends(get_db)):
    project = pipelines.connected_project(db, project_id)
    pipeline, jobs = await pipelines.pipeline_and_jobs(project, pipeline_id)
    return {"pipeline": pipeline, "jobs": jobs}


@router.get("/projects/{project_id}/pipelines/{pipeline_id}/jobs/{job_id}/trace")
async def trace(project_id: str, pipeline_id: int, job_id: int, db: Session = Depends(get_db)):
    project = pipelines.connected_project(db, project_id)
    _, _, logs, _ = await pipelines.job_context(project, pipeline_id, job_id, include_ci=False)
    limit = get_settings().log_max_chars
    safe = redact(logs)
    return {
        "text": excerpt(logs, limit),
        "truncated": len(safe) > limit,
        "redacted": True,
        "source": project.source,
    }


def get_analysis(db: Session, analysis_id: str):
    prune(db)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.source != pipelines.source():
        raise HTTPException(404, "Analysis not found in the current mode")
    return analysis


async def acquire_slot():
    try:
        await asyncio.wait_for(ai_slots.acquire(), timeout=0.1)
    except TimeoutError as exc:
        raise HTTPException(429, "Two AI requests are already running; retry shortly") from exc


@router.post("/analyses", response_model=AnalysisOut, status_code=201)
async def analyze(body: AnalyzeRequest, db: Session = Depends(get_db)):
    project = pipelines.connected_project(db, body.project_id)
    await acquire_slot()
    try:
        pipeline, job, logs, ci = await pipelines.job_context(
            project, body.pipeline_id, body.job_id
        )
        if job["status"] != "failed":
            raise HTTPException(422, "Select a failed job to diagnose")
        if project.source == "demo":
            result = PipelineDiagnosis(**demo.diagnosis(body.pipeline_id))
        else:
            result = await Diagnostician().analyze(
                job=job, pipeline=pipeline, logs=logs, ci=ci, context=body.context
            )
        prune(db)
        analysis = Analysis(
            id=str(uuid4()),
            project_id=project.id,
            pipeline_id=body.pipeline_id,
            job_id=body.job_id,
            job_name=job["name"],
            source=project.source,
            diagnosis=result.model_dump(),
            pipeline=pipeline,
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        return analysis
    finally:
        ai_slots.release()


@router.get("/analyses", response_model=list[AnalysisOut])
def history(db: Session = Depends(get_db), limit: int = Query(30, ge=1, le=100)):
    prune(db)
    return db.scalars(
        select(Analysis)
        .where(Analysis.source == pipelines.source())
        .order_by(Analysis.created_at.desc())
        .limit(limit)
    ).all()


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def analysis_detail(analysis_id: str, db: Session = Depends(get_db)):
    return get_analysis(db, analysis_id)


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: str, db: Session = Depends(get_db)):
    db.delete(get_analysis(db, analysis_id))
    db.commit()


@router.post("/analyses/{analysis_id}/messages", response_model=AnalysisOut)
async def chat(analysis_id: str, body: ChatRequest, db: Session = Depends(get_db)):
    analysis = get_analysis(db, analysis_id)
    if len(analysis.messages) >= 100:
        raise HTTPException(422, "Conversation limit reached (50 exchanges); create a new analysis")
    question = redact(body.message)
    await acquire_slot()
    try:
        if analysis.source == "demo":
            reply = (
                "[Simulated assistant — no LLM call] "
                + analysis.diagnosis["root_cause"]
                + "\n\nRecommended check: "
                + analysis.diagnosis["suggested_fixes"][0]
                + "\n\nThis demo reply is fixed, not a generated answer to your question. No correction has been tested."
            )
        else:
            reply = await Diagnostician().chat(
                analysis.diagnosis, analysis.pipeline, analysis.messages, question
            )
        for role, content in (("user", question), ("assistant", reply)):
            analysis.messages.append(Message(id=str(uuid4()), role=role, content=content))
        db.commit()
        db.refresh(analysis)
        return analysis
    finally:
        ai_slots.release()


def authorized(authorization: str | None):
    key = get_settings().app_api_key
    if key and not secrets.compare_digest(authorization or "", f"Bearer {key}"):
        raise HTTPException(401, "API key required; enter it in Settings")
