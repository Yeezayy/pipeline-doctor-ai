import re
from urllib.parse import quote, unquote, urlsplit
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.identity import owner_id
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
    if not project or project.source != source() or project.owner_id != owner_id():
        raise HTTPException(404, "Connected project not found in the current mode")
    return project


async def connect(db: Session, gitlab_id: str | int):
    async with gitlab_client() as client:
        data = await client.project(gitlab_id)
    return save_project(db, data)


def save_project(db: Session, data: dict) -> Project:
    project = Project(
        id=str(uuid5(NAMESPACE_URL, f"{owner_id()}:{data['id']}"))
        if owner_id()
        else f"live-{data['id']}",
        gitlab_id=data["id"],
        name=redact(data["path_with_namespace"]),
        web_url=data["web_url"],
        source="live",
        owner_id=owner_id(),
    )
    project = db.merge(project)
    db.commit()
    return project


def pipeline_url_target(url: str) -> tuple[str, int]:
    """Extract identifiers only; never send credentials to a user-supplied URL."""
    url = url.strip()
    invalid = HTTPException(422, "Enter a GitLab pipeline URL ending in /-/pipelines/123")
    if any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise invalid
    try:
        target = urlsplit(url)
        instance = urlsplit(str(get_settings().gitlab_url))
        target_port = (
            target.port if target.port is not None else (443 if target.scheme == "https" else 80)
        )
        instance_port = (
            instance.port
            if instance.port is not None
            else (443 if instance.scheme == "https" else 80)
        )
    except ValueError as exc:
        raise invalid from exc
    if target.username is not None or target.password is not None:
        raise invalid
    if (target.scheme, target.hostname, target_port) != (
        instance.scheme,
        instance.hostname,
        instance_port,
    ):
        raise HTTPException(
            422, "Use a pipeline URL from the GitLab instance configured in Settings"
        )
    prefix = re.escape(unquote(instance.path).rstrip("/"))
    match = re.fullmatch(
        prefix + r"/(?P<project>[\w.-]+(?:/[\w.-]+)+)/-/pipelines/(?P<id>[1-9][0-9]{0,15})/?",
        unquote(target.path),
    )
    if not match or any(part in (".", "..") for part in match["project"].split("/")):
        raise invalid
    pipeline_id = int(match["id"])
    if pipeline_id > 2**53 - 1:
        raise invalid
    return match["project"], pipeline_id


async def resolve_pipeline(db: Session, url: str):
    if get_settings().demo_mode:
        raise HTTPException(
            409,
            "Real pipeline URLs require a live GitLab connection; this workspace is in demo mode",
        )
    path, pipeline_id = pipeline_url_target(url)
    async with gitlab_client() as client:
        data = await client.project(path)
        pipeline = await client.pipeline(data["id"], pipeline_id)
        jobs = await client.jobs(data["id"], pipeline_id)
    # Connect only after access to the pipeline and its jobs has been verified.
    project = save_project(db, data)
    return {
        "project": project_out(project),
        "pipeline": pipeline_out(pipeline),
        "jobs": [job_out(job) for job in jobs],
    }


async def connected(db: Session):
    if source() == "demo":
        ensure_demo(db)
    result = db.scalars(
        select(Project).where(Project.source == source(), Project.owner_id == owner_id())
    ).all()
    configured = get_settings().gitlab_project_id
    if not result and configured and source() == "live" and owner_id() is None:
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


async def job_context(project: Project, pipeline_id: int, job_id: int, *, include_ci: bool = True):
    pipeline, jobs = await pipeline_and_jobs(project, pipeline_id)
    job = next((job for job in jobs if job["id"] == job_id), None)
    if not job:
        raise HTTPException(404, "Job does not belong to the selected pipeline")
    if project.source == "demo":
        return (
            pipeline,
            job,
            demo.trace(pipeline_id),
            demo.ci_file(pipeline_id) if include_ci else None,
        )
    async with gitlab_client() as client:
        logs = await client.trace(project.gitlab_id, job_id)
        # Use immutable commit SHA, not a branch that could have moved.
        ci = await client.ci_file(project.gitlab_id, pipeline["sha"]) if include_ci else None
    return pipeline, job, logs, ci


async def pipeline_ci(project: Project, pipeline_id: int):
    if project.source == "demo":
        pipeline = next((p for p in demo.pipelines() if p["id"] == pipeline_id), None)
        if pipeline is None:
            raise HTTPException(404, "Demo pipeline not found")
        ci = demo.ci_file(pipeline_id)
    else:
        async with gitlab_client() as client:
            pipeline = await client.pipeline(project.gitlab_id, pipeline_id)
            ci = await client.ci_file(project.gitlab_id, pipeline["sha"])
    # Mask before truncation, retaining source line numbers even for multiline keys.
    safe = redact(ci, preserve_lines=True) if ci is not None else None
    limit = 64_000
    truncated = safe is not None and len(safe) > limit
    if truncated:
        end = safe.rfind("\n", 0, limit)
        safe = safe[: end if end > 0 else limit]
    return {
        "path": ".gitlab-ci.yml",
        "commit_sha": pipeline["sha"],
        "text": safe,
        "truncated": truncated,
        "source": project.source,
        "web_url": (
            project.web_url.rstrip("/")
            + "/-/blob/"
            + quote(pipeline["sha"], safe="")
            + "/.gitlab-ci.yml"
            if project.source == "live"
            else None
        ),
    }
