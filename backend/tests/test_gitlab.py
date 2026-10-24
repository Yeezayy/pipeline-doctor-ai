import httpx
import pytest

from app.integrations.gitlab import GitLabClient, GitLabError


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500, 302])
async def test_http_errors(status):
    client = GitLabClient(
        "https://gitlab.example",
        "test-only",
        transport=httpx.MockTransport(lambda request: httpx.Response(status)),
    )
    try:
        with pytest.raises(GitLabError) as caught:
            await client.projects()
        assert caught.value.status == (status if status in (401, 403, 404, 429) else 502)
        assert "test-only" not in caught.value.message
    finally:
        await client.close()


async def test_official_endpoints_and_auth():
    seen = []

    def handler(request):
        seen.append(request)
        assert request.headers["PRIVATE-TOKEN"] == "test-only"
        path = request.url.path
        if path.endswith("/trace"):
            return httpx.Response(200, text="error: build failed")
        if path.endswith("/raw"):
            assert request.url.params["ref"] == "immutable-sha"
            return httpx.Response(200, text="image: python:3.12")
        if path.endswith("/jobs"):
            return httpx.Response(
                200, json=[{"id": 9, "name": "build", "status": "failed", "stage": "build"}]
            )
        if path.endswith("/pipelines/2"):
            return httpx.Response(
                200, json={"id": 2, "status": "failed", "ref": "main", "sha": "abc"}
            )
        if path.endswith("/pipelines"):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 2,
                        "status": "failed",
                        "ref": "main",
                        "sha": "abc",
                        "web_url": "https://gitlab.example/2",
                        "created_at": "2026-01-01",
                    }
                ],
            )
        if path.endswith("/projects"):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 1,
                        "name": "demo",
                        "path_with_namespace": "group/demo",
                        "web_url": "https://gitlab.example/demo",
                    }
                ],
            )
        return httpx.Response(
            200,
            json={
                "id": 1,
                "path_with_namespace": "group/demo",
                "web_url": "https://gitlab.example/demo",
            },
        )

    client = GitLabClient(
        "https://gitlab.example", "test-only", transport=httpx.MockTransport(handler)
    )
    try:
        assert (await client.projects())[0]["id"] == 1
        assert (await client.project("group/demo"))["id"] == 1
        assert (await client.pipelines(1))[0]["id"] == 2
        assert (await client.pipeline(1, 2))["status"] == "failed"
        assert (await client.jobs(1, 2))[0]["id"] == 9
        assert "build failed" in await client.trace(1, 9)
        assert "python" in await client.ci_file(1, "immutable-sha")
        assert all("/api/v4/" in str(request.url) for request in seen)
        assert "%2F" in str(seen[1].url)
    finally:
        await client.close()


@pytest.mark.parametrize("data", [{}, [{"id": 1}], None, "broken"])
async def test_incomplete_responses(data):
    client = GitLabClient(
        "https://gitlab.example",
        "test-only",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=data)),
    )
    try:
        with pytest.raises(GitLabError):
            await client.projects()
    finally:
        await client.close()


async def test_timeout_and_missing_ci():
    def timeout(request):
        raise httpx.ReadTimeout("secret-containing upstream detail")

    client = GitLabClient(
        "https://gitlab.example", "test-only", transport=httpx.MockTransport(timeout)
    )
    try:
        with pytest.raises(GitLabError, match="unavailable"):
            await client.projects()
    finally:
        await client.close()
    client = GitLabClient(
        "https://gitlab.example",
        "test-only",
        transport=httpx.MockTransport(lambda request: httpx.Response(403)),
    )
    try:
        assert await client.ci_file(1, "main") is None
    finally:
        await client.close()


async def test_trace_size_cap():
    client = GitLabClient(
        "https://gitlab.example",
        "test-only",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=b"x" * 2_000_001)
        ),
    )
    try:
        with pytest.raises(GitLabError) as caught:
            await client.trace(1, 2)
        assert caught.value.status == 413
    finally:
        await client.close()


async def test_ci_file_size_cap():
    client = GitLabClient(
        "https://gitlab.example",
        "test-only",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 500_001)),
    )
    try:
        assert await client.ci_file(1, "immutable-sha") is None
    finally:
        await client.close()
