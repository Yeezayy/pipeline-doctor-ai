from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import redact
from app.integrations.gitlab import gitlab_client
from app.models.entities import Project
from app.services import demo


def source() -> str:
    return "demo" if get_settings().demo_mode else "live"


def project_out(project: Project):
    return {key: getattr(project, key) for key in ("id", "gitlab_id", "name", "web_url", "source")}


def ensure_demo(db: Session):
    if not db.get(Project, "demo-1"):
        db.add(Project(**demo.PROJECT))
        db.commit()


def connected_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if not project or project.source != source():
        raise HTTPException(404, "Connected project not found in the current mode")
    return project


async def connect(db: Session, gitlab_id: str | int):
    async with gitlab_client() as client:
        data = await client.project(gitlab_id)
    project = Project(
        id=f"live-{data['id']}",
        gitlab_id=data["id"],
        name=redact(data["path_with_namespace"]),
        web_url=data["web_url"],
        source="live",
    )
    project = db.merge(project)
    db.commit()
    return project


async def connected(db: Session):
    if source() == "demo":
        ensure_demo(db)
    result = db.scalars(select(Project).where(Project.source == source())).all()
    configured = get_settings().gitlab_project_id
    if not result and configured and source() == "live":
        result = [await connect(db, configured)]
    return [project_out(project) for project in result]


def pipeline_out(row):
    return {
        key: redact(str(row.get(key, ""))) if key in ("ref", "sha") else row.get(key)
        for key in ("id", "status", "ref", "sha", "web_url", "created_at")
    }


def job_out(row):
    return {
        key: redact(row[key]) if key == "name" else row.get(key)
        for key in ("id", "name", "stage", "status", "duration")
    }


async def pipeline_and_jobs(project: Project, pipeline_id: int):
    if project.source == "demo":
        pipeline = next((p for p in demo.pipelines() if p["id"] == pipeline_id), None)
        if not pipeline:
            raise HTTPException(404, "Demo pipeline not found")
        return pipeline, demo.jobs(pipeline_id)
    async with gitlab_client() as client:
        pipeline = await client.pipeline(project.gitlab_id, pipeline_id)
        jobs = await client.jobs(project.gitlab_id, pipeline_id)
    return pipeline_out(pipeline), [job_out(job) for job in jobs]


async def job_context(project: Project, pipeline_id: int, job_id: int):
    pipeline, jobs = await pipeline_and_jobs(project, pipeline_id)
    job = next((job for job in jobs if job["id"] == job_id), None)
    if not job:
        raise HTTPException(404, "Job does not belong to the selected pipeline")
    if project.source == "demo":
        return (
            pipeline,
            job,
            demo.trace(pipeline_id),
            "# Simulated CI configuration\nimage: alpine:3.21\n",
        )
    async with gitlab_client() as client:
        logs = await client.trace(project.gitlab_id, job_id)
        # Use immutable commit SHA, not a branch that could have moved.
        ci = await client.ci_file(project.gitlab_id, pipeline["sha"])
    return pipeline, job, logs, ci
