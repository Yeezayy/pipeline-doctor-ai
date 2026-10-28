import httpx
import pytest
from pydantic import HttpUrl

from app.core.config import get_settings
from app.integrations.gitlab import GitLabClient


@pytest.fixture
def gitlab(monkeypatch):
    settings = get_settings()
    settings.demo_mode = False
    settings.gitlab_token = "fixture-only-token"
    settings.gitlab_url = HttpUrl("https://gitlab.example")
    seen = []
    failures = {}

    def handler(request):
        seen.append(request)
        assert request.method == "GET"
        assert request.headers["private-token"] == "fixture-only-token"
        assert request.url.host == "gitlab.example"
        path = request.url.path
        for suffix, status in failures.items():
            if path.endswith(suffix):
                return httpx.Response(status)
        if path.endswith("/pipelines/123/jobs"):
            return httpx.Response(
                200,
                json=[{"id": 9, "name": "build", "stage": "build", "status": "failed"}],
            )
        if path.endswith("/pipelines/123"):
            return httpx.Response(
                200,
                json={
                    "id": 123,
                    "status": "failed",
                    "ref": "feature/example",
                    "sha": "immutable-commit",
                },
            )
        if path.endswith("/projects/team/subgroup/app"):
            assert b"team%2Fsubgroup%2Fapp" in request.url.raw_path
            return httpx.Response(
                200,
                json={
                    "id": 7,
                    "path_with_namespace": "team/subgroup/app",
                    "web_url": "https://gitlab.example/team/subgroup/app",
                },
            )
        raise AssertionError(f"Unexpected GitLab request: {path}")

    original = GitLabClient.__init__

    def init(self, url, token, **kwargs):
        original(self, url, token, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(GitLabClient, "__init__", init)
    return seen, failures


def test_open_url_connects_project_and_returns_pipeline_and_jobs(client, gitlab):
    url = "https://gitlab.example/team/subgroup/app/-/pipelines/123"
    response = client.post("/api/pipelines/resolve", json={"url": url})
    assert response.status_code == 200
    result = response.json()
    assert result["project"]["id"] == "live-7"
    assert result["project"]["name"] == "team/subgroup/app"
    assert result["pipeline"]["id"] == 123
    assert result["pipeline"]["sha"] == "immutable-commit"
    assert result["jobs"][0]["id"] == 9
    assert "fixture-only-token" not in response.text
    assert len(gitlab[0]) == 3
    # Reopening a bookmarked URL must not create a second connected project.
    assert client.post("/api/pipelines/resolve", json={"url": url}).status_code == 200
    assert len(client.get("/api/projects").json()) == 1
    assert client.get("/api/projects/live-7/pipelines/123").status_code == 200


def test_self_managed_instance_subpath_and_url_suffixes(client, gitlab):
    get_settings().gitlab_url = HttpUrl("https://gitlab.example/gitlab")
    response = client.post(
        "/api/pipelines/resolve",
        json={
            "url": " https://gitlab.example:443/gitlab/team/subgroup/app/-/pipelines/123/?page=2#jobs "
        },
    )
    assert response.status_code == 200
    assert all(request.url.path.startswith("/gitlab/api/v4/") for request in gitlab[0])
    assert all(
        "page=2" not in str(request.url) and not request.url.fragment for request in gitlab[0]
    )


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example/team/subgroup/app/-/pipelines/123",
        "https://gitlab.example.evil.example/team/subgroup/app/-/pipelines/123",
        "https://gitlab.example:8443/team/subgroup/app/-/pipelines/123",
        "https://gitlab.example:0/team/subgroup/app/-/pipelines/123",
        "http://gitlab.example/team/subgroup/app/-/pipelines/123",
        "https://user:secret@gitlab.example/team/subgroup/app/-/pipelines/123",
        "//gitlab.example/team/subgroup/app/-/pipelines/123",
        "https://[broken/team/subgroup/app/-/pipelines/123",
        "https://gitlab.example:invalid/team/subgroup/app/-/pipelines/123",
        "https://gitlab.example/team/subgroup/app/-/jobs/123",
        "https://gitlab.example/app/-/pipelines/123",
        "https://gitlab.example/team/../app/-/pipelines/123",
        "https://gitlab.example/team/%2e%2e/app/-/pipelines/123",
        "https://gitlab.example/team//app/-/pipelines/123",
        "https://gitlab.example/team/subgroup/app/-/pipelines/0",
        "https://gitlab.example/team/subgroup/app/-/pipelines/-1",
        "https://gitlab.example/team/subgroup/app/-/pipelines/9007199254740992",
        "https://gitlab.example/team/subgroup/app/-/pipelines/123/jobs",
        "https://gitlab.example/team/subgroup/app/-/pipelines/1\n23",
    ],
)
def test_invalid_or_external_urls_do_not_call_gitlab_or_connect_projects(client, gitlab, url):
    response = client.post("/api/pipelines/resolve", json={"url": url})
    assert response.status_code == 422
    assert gitlab[0] == []
    assert client.get("/api/projects").json() == []


def test_self_managed_url_requires_the_configured_subpath(client, gitlab):
    get_settings().gitlab_url = HttpUrl("https://gitlab.example/gitlab")
    response = client.post(
        "/api/pipelines/resolve",
        json={"url": "https://gitlab.example/team/subgroup/app/-/pipelines/123"},
    )
    assert response.status_code == 422
    assert gitlab[0] == []


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500, 302])
@pytest.mark.parametrize("resource", ["/projects/team/subgroup/app", "/pipelines/123", "/jobs"])
def test_upstream_failure_does_not_connect_project(client, gitlab, status, resource):
    gitlab[1][resource] = status
    response = client.post(
        "/api/pipelines/resolve",
        json={"url": "https://gitlab.example/team/subgroup/app/-/pipelines/123"},
    )
    assert response.status_code == (status if status in (401, 403, 404, 429) else 502)
    assert client.get("/api/projects").json() == []


def test_demo_rejects_real_pipeline_urls(client, gitlab):
    get_settings().demo_mode = True
    response = client.post(
        "/api/pipelines/resolve",
        json={"url": "https://gitlab.example/team/subgroup/app/-/pipelines/123"},
    )
    assert response.status_code == 409
    assert "demo mode" in response.json()["detail"]
    assert gitlab[0] == []
