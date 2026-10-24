from uuid import uuid4

from app.core.database import SessionLocal
from app.models.entities import Analysis, Project
from app.services.demo import diagnosis


def test_large_gitlab_ids_are_persisted():
    large_id = 3_000_000_000
    with SessionLocal() as db:
        db.add(
            Project(
                id="live-large",
                gitlab_id=large_id,
                name="team/project",
                web_url="https://gitlab.example",
                source="live",
            )
        )
        db.commit()
        item = Analysis(
            id=str(uuid4()),
            project_id="live-large",
            pipeline_id=large_id + 1,
            job_id=large_id + 2,
            job_name="build",
            source="live",
            diagnosis=diagnosis(1048),
            pipeline={"id": large_id + 1},
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        assert item.job_id == large_id + 2
