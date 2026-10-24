from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.entities import Analysis, Message


def make_analysis(client, pipeline=1048):
    client.get("/api/projects").raise_for_status()
    return client.post(
        "/api/analyses",
        json={"project_id": "demo-1", "pipeline_id": pipeline, "job_id": pipeline * 10},
    )


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected", "mode": "demo"}
    assert response.headers["x-request-id"]


@pytest.mark.parametrize("pipeline", range(1043, 1049))
def test_six_demo_incidents(client, pipeline):
    result = make_analysis(client, pipeline)
    assert result.status_code == 201
    analysis = result.json()
    assert analysis["source"] == "demo"
    assert analysis["diagnosis"]["fixes_tested"] is False
    assert analysis["diagnosis"]["evidence"]
    assert "logs" not in analysis
    detail = client.get(f"/api/analyses/{analysis['id']}")
    assert detail.json()["id"] == analysis["id"]


def test_chat_and_delete_cascade(client):
    analysis = make_analysis(client).json()
    result = client.post(
        f"/api/analyses/{analysis['id']}/messages",
        json={"message": "password=never-store-this what next?"},
    )
    assert result.status_code == 200
    messages = result.json()["messages"]
    assert len(messages) == 2
    assert "never-store-this" not in messages[0]["content"]
    assert "Simulated assistant" in messages[1]["content"]
    assert len(client.get("/api/analyses").json()) == 1
    assert client.delete(f"/api/analyses/{analysis['id']}").status_code == 204
    assert client.get(f"/api/analyses/{analysis['id']}").status_code == 404
    with SessionLocal() as db:
        assert db.scalars(select(Message)).all() == []


def test_trace_and_pipeline(client):
    client.get("/api/projects")
    rows = client.get("/api/projects/demo-1/pipelines").json()
    assert len(rows) == 9
    assert client.get("/api/projects/demo-1/pipelines?page=2").json() == []
    detail = client.get("/api/projects/demo-1/pipelines/1048").json()
    assert detail["jobs"][0]["status"] == "failed"
    trace = client.get("/api/projects/demo-1/pipelines/1048/jobs/10480/trace").json()
    assert "Dockerfile" in trace["text"]
    assert trace["redacted"]
    assert client.get("/api/projects/demo-1/pipelines/1048/jobs/1/trace").status_code == 404


def test_reject_successful_job_and_invalid_inputs(client):
    assert make_analysis(client, 1042).status_code == 422
    assert (
        client.post(
            "/api/analyses", json={"project_id": "demo-1", "pipeline_id": -1, "job_id": 1}
        ).status_code
        == 422
    )
    assert client.get("/api/projects/demo-1/pipelines?page=0").status_code == 422
    analysis = make_analysis(client).json()
    assert (
        client.post(f"/api/analyses/{analysis['id']}/messages", json={"message": "   "}).status_code
        == 422
    )


def test_mode_isolation(client):
    analysis = make_analysis(client).json()
    get_settings().demo_mode = False
    assert client.get(f"/api/analyses/{analysis['id']}").status_code == 404
    assert client.get("/api/analyses").json() == []
    assert client.get("/api/projects/demo-1/pipelines").status_code == 404


def test_auth_and_no_credential_disclosure(client):
    settings = get_settings()
    settings.app_api_key = "local-test-protection"
    settings.gitlab_token = "not-a-real-credential"
    assert client.get("/api/settings").status_code == 401
    result = client.get("/api/settings", headers={"Authorization": "Bearer local-test-protection"})
    assert result.status_code == 200
    assert "not-a-real-credential" not in result.text
    assert "local-test-protection" not in result.text
    assert client.get("/health").status_code == 200


def test_retention(client):
    analysis = make_analysis(client).json()
    with SessionLocal() as db:
        item = db.get(Analysis, analysis["id"])
        item.created_at = datetime.now(UTC) - timedelta(days=31)
        db.commit()
    assert client.get("/api/analyses").json() == []
