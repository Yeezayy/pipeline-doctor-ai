import httpx
import pytest

from app.core.config import get_settings
from app.integrations.gitlab import GitLabClient


@pytest.fixture
def live_ci(client, monkeypatch):
    settings = get_settings()
    settings.demo_mode = False
    settings.gitlab_token = "fixture-only-secret"
    state = {"status": 200, "text": "image: alpine:3.21\n", "requests": []}

    def handler(request):
        state["requests"].append(request)
        if request.url.path.endswith("/raw"):
            assert request.url.params["ref"] == "actual-pipeline-commit"
            return httpx.Response(state["status"], text=state["text"])
        if request.url.path.endswith("/pipelines/123"):
            return httpx.Response(
                200,
                json={
                    "id": 123,
                    "status": "failed",
                    "ref": "moving-branch",
                    "sha": "actual-pipeline-commit",
                },
            )
        if "/pipelines/" in request.url.path:
            return httpx.Response(404)
        return httpx.Response(
            200,
            json={
                "id": 7,
                "path_with_namespace": "team/app",
                "web_url": "https://gitlab.com/team/app",
            },
        )

    original = GitLabClient.__init__

    def init(self, url, token, **kwargs):
        original(self, url, token, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(GitLabClient, "__init__", init)
    assert client.post("/api/projects", json={"gitlab_id": 7}).status_code == 201
    state["requests"].clear()
    return state


def test_ci_uses_run_commit_and_masks_secrets_without_shifting_lines(client, live_ci):
    text = (
        "include:\n  - local: .gitlab/ci/build.yml\nvariables:\n"
        "  PASSWORD: a-sensitive-value\n  PRIVATE_KEY: |\n"
        "    -----BEGIN RSA PRIVATE KEY-----\n    sensitive-key-content\n"
        "    -----END RSA PRIVATE KEY-----\nbuild:\n  script: echo fixture-only-secret\n"
    )
    live_ci["text"] = text
    response = client.get("/api/projects/live-7/pipelines/123/ci")
    assert response.status_code == 200
    result = response.json()
    assert result["commit_sha"] == "actual-pipeline-commit"
    assert (
        result["web_url"]
        == "https://gitlab.com/team/app/-/blob/actual-pipeline-commit/.gitlab-ci.yml"
    )
    assert result["source"] == "live"
    assert not result["truncated"]
    assert result["text"].count("\n") == text.count("\n")
    assert result["text"].splitlines().index("build:") == text.splitlines().index("build:")
    assert "[REDACTED]" in result["text"]
    for secret in ("a-sensitive-value", "sensitive-key-content", "fixture-only-secret"):
        assert secret not in response.text
    assert len(live_ci["requests"]) == 2  # No job trace or LLM call is needed.


@pytest.mark.parametrize("status", [403, 404])
def test_missing_or_forbidden_ci_is_an_unavailable_file(client, live_ci, status):
    live_ci["status"] = status
    result = client.get("/api/projects/live-7/pipelines/123/ci")
    assert result.status_code == 200
    assert result.json()["text"] is None


def test_empty_file_is_distinct_from_missing_file(client, live_ci):
    live_ci["text"] = ""
    assert client.get("/api/projects/live-7/pipelines/123/ci").json()["text"] == ""


def test_large_yaml_is_masked_before_excerpting(client, live_ci):
    live_ci["text"] = (
        "# configuration\n" + "# padding\n" * 7000 + "TOKEN: glpat-never-show-this-secret\n"
    )
    response = client.get("/api/projects/live-7/pipelines/123/ci")
    result = response.json()
    assert result["truncated"]
    assert len(result["text"]) <= 64000
    assert result["text"].startswith("# configuration")
    assert "never-show" not in response.text


def test_oversized_file_does_not_reach_the_browser(client, live_ci):
    live_ci["text"] = "x" * 500_001
    result = client.get("/api/projects/live-7/pipelines/123/ci")
    assert result.json()["text"] is None


def test_upstream_failure_and_missing_pipeline_are_not_replaced_with_demo(client, live_ci):
    live_ci["status"] = 500
    assert client.get("/api/projects/live-7/pipelines/123/ci").status_code == 502
    live_ci["requests"].clear()
    assert client.get("/api/projects/live-7/pipelines/999/ci").status_code == 404
    assert len(live_ci["requests"]) == 1


def test_unconnected_project_is_rejected_before_any_gitlab_call(client, live_ci):
    assert client.get("/api/projects/unconnected/pipelines/123/ci").status_code == 404
    assert live_ci["requests"] == []


def test_demo_configuration_is_explicit_and_validates_pipeline(client):
    client.get("/api/projects").raise_for_status()
    result = client.get("/api/projects/demo-1/pipelines/1048/ci").json()
    assert result["source"] == "demo"
    assert "SIMULATED" in result["text"]
    assert "docker-build:" in result["text"]
    assert result["web_url"] is None
    assert client.get("/api/projects/demo-1/pipelines/999/ci").status_code == 404
