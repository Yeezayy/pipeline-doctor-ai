from unittest.mock import AsyncMock

import httpx

from app.api import routes
from app.core.config import get_settings
from app.integrations.gitlab import GitLabClient
from app.schemas.diagnosis import PipelineDiagnosis
from app.services.demo import diagnosis


def test_live_workflow_with_mocked_gitlab_and_llm(client, monkeypatch):
    settings = get_settings()
    settings.demo_mode = False
    settings.gitlab_token = "mock-only-not-a-token"
    pipeline = {
        "id": 2,
        "status": "failed",
        "ref": "main",
        "sha": "abc",
        "web_url": "https://gitlab.example/pipelines/2",
        "created_at": "2026-01-01T00:00:00Z",
    }

    def handler(request):
        path = request.url.path
        if path.endswith("/trace"):
            return httpx.Response(
                200, text="password=hidden-trace-value\n" + diagnosis(1048)["evidence"][0]
            )
        if path.endswith("/raw"):
            return httpx.Response(404)
        if path.endswith("/jobs"):
            return httpx.Response(
                200, json=[{"id": 3, "name": "docker-build", "stage": "build", "status": "failed"}]
            )
        if path.endswith("/pipelines/2"):
            return httpx.Response(200, json=pipeline)
        if path.endswith("/pipelines"):
            return httpx.Response(200, json=[pipeline])
        project = {
            "id": 1,
            "name": "app",
            "path_with_namespace": "team/app",
            "web_url": "https://gitlab.example/team/app",
        }
        return httpx.Response(200, json=[project] if path.endswith("/projects") else project)

    original_init = GitLabClient.__init__

    def mocked_init(self, url, token, **kwargs):
        original_init(self, url, token, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(GitLabClient, "__init__", mocked_init)
    ai = AsyncMock()
    ai.analyze.return_value = PipelineDiagnosis(**diagnosis(1048))
    ai.chat.return_value = "Check the Dockerfile build context; this fix is untested."
    monkeypatch.setattr(routes, "Diagnostician", lambda: ai)
    assert client.get("/api/connection").status_code == 200
    assert client.get("/api/projects/available").json()[0]["id"] == 1
    assert client.post("/api/projects", json={"gitlab_id": 1}).json()["id"] == "live-1"
    assert client.get("/api/projects/live-1/pipelines").json()[0]["id"] == 2
    trace = client.get("/api/projects/live-1/pipelines/2/jobs/3/trace").json()
    assert "hidden-trace-value" not in trace["text"]
    response = client.post(
        "/api/analyses", json={"project_id": "live-1", "pipeline_id": 2, "job_id": 3}
    )
    assert response.status_code == 201
    saved = response.json()
    assert saved["source"] == "live"
    assert "hidden-trace-value" not in response.text
    assert ai.analyze.call_args.kwargs["ci"] is None
    assert (
        client.post(f"/api/analyses/{saved['id']}/messages", json={"message": "What next?"})
        .json()["messages"][-1]["content"]
        .startswith("Check the Dockerfile")
    )
