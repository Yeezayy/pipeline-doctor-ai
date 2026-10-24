from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import quote, urlparse

import httpx


class GitLabError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


class GitLabClient:
    """One client per request; no credentials in URLs or exception messages."""

    def __init__(self, url: str, token: str, transport=None):
        parsed = urlparse(url)
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise GitLabError(503, "GITLAB_URL must not contain credentials, query or fragment")
        self.client = httpx.AsyncClient(
            base_url=url.rstrip("/") + "/api/v4/",
            headers={"PRIVATE-TOKEN": token},
            timeout=httpx.Timeout(20, connect=5),
            transport=transport,
            follow_redirects=False,
        )

    async def close(self):
        await self.client.aclose()

    @staticmethod
    def check(response: httpx.Response):
        if response.is_error or response.is_redirect:
            messages = {
                401: "GitLab authentication failed; check the server token",
                403: "GitLab permission denied; use a token with read_api and repository access",
                404: "GitLab resource not found or inaccessible",
                429: "GitLab rate limit reached; retry later",
            }
            status = response.status_code
            raise GitLabError(
                status if status in messages else 502,
                messages.get(status, "GitLab upstream request failed"),
            )

    async def get(self, path: str, params=None):
        try:
            response = await self.client.get(path, params=params)
            self.check(response)
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GitLabError(
                502, "GitLab unavailable, timed out or returned invalid JSON"
            ) from exc

    async def projects(self, page: int = 1, search: str = ""):
        result = await self.get(
            "projects",
            {"membership": True, "simple": True, "per_page": 50, "page": page, "search": search},
        )
        return self.rows(result, ("id", "name", "path_with_namespace", "web_url"))

    async def project(self, project_id: str | int):
        result = await self.get(f"projects/{quote(str(project_id), safe='')}")
        self.require(result, ("id", "path_with_namespace", "web_url"))
        return result

    @staticmethod
    def require(row, keys):
        if not isinstance(row, dict) or any(key not in row or row[key] is None for key in keys):
            raise GitLabError(502, "GitLab returned incomplete data")

    @classmethod
    def rows(cls, result, keys):
        if not isinstance(result, list):
            raise GitLabError(502, "GitLab returned an invalid list")
        for row in result:
            cls.require(row, keys)
        return result

    async def pipelines(self, project_id: int, page: int = 1):
        rows = await self.get(
            f"projects/{project_id}/pipelines",
            {"per_page": 30, "page": page, "order_by": "id", "sort": "desc"},
        )
        return self.rows(rows, ("id", "status", "ref", "sha", "web_url", "created_at"))

    async def pipeline(self, project_id: int, pipeline_id: int):
        row = await self.get(f"projects/{project_id}/pipelines/{pipeline_id}")
        self.require(row, ("id", "status", "ref", "sha"))
        return row

    async def jobs(self, project_id: int, pipeline_id: int):
        # Fetch all pages: failed jobs may be after the first 100 entries.
        result = []
        for page in range(1, 21):
            rows = await self.get(
                f"projects/{project_id}/pipelines/{pipeline_id}/jobs",
                {"per_page": 100, "page": page},
            )
            result.extend(self.rows(rows, ("id", "name", "status", "stage")))
            if len(rows) < 100:
                return result
        raise GitLabError(422, "Pipeline exceeds the MVP limit of 2000 jobs")

    async def trace(self, project_id: int, job_id: int) -> str:
        try:
            async with self.client.stream(
                "GET", f"projects/{project_id}/jobs/{job_id}/trace"
            ) as response:
                self.check(response)
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(chunks) + len(chunk) > 2_000_000:
                        raise GitLabError(
                            413,
                            "Job trace exceeds the 2 MB safety limit; reduce the job output before analysis",
                        )
                    chunks.extend(chunk)
                return chunks.decode("utf-8", errors="replace")
        except httpx.HTTPError as exc:
            raise GitLabError(502, "GitLab trace unavailable or timed out") from exc

    async def ci_file(self, project_id: int, ref: str) -> str | None:
        try:
            response = await self.client.get(
                f"projects/{project_id}/repository/files/.gitlab-ci.yml/raw", params={"ref": ref}
            )
            if response.status_code in (403, 404):
                return None
            self.check(response)
            if len(response.content) > 500_000:
                return None
            return response.text
        except httpx.HTTPError as exc:
            raise GitLabError(502, "GitLab CI configuration request failed") from exc


@asynccontextmanager
async def gitlab_client() -> AsyncIterator[GitLabClient]:
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.gitlab_token:
        raise GitLabError(503, "Set GITLAB_TOKEN on the backend to connect GitLab")
    client = GitLabClient(str(settings.gitlab_url), settings.gitlab_token)
    try:
        yield client
    finally:
        await client.close()
