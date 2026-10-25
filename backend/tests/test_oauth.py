import base64
import hashlib
import time
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import HttpUrl, ValidationError
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.identity import Identity, identity
from app.core.security import redact
from app.main import app
from app.models.entities import Analysis, LoginSession, OAuthState, Project
from app.services import oauth
from app.services.demo import diagnosis

ORIGIN = "http://testserver"
HEADERS = {"Origin": ORIGIN}


@pytest.fixture
def oauth_config(monkeypatch):
    settings = get_settings()
    settings.demo_mode = False
    settings.auth_mode = "gitlab"
    settings.public_app_url = HttpUrl(ORIGIN)
    settings.gitlab_client_id = "fixture-client"
    settings.gitlab_client_secret = "fixture-client-secret"
    settings.token_encryption_key = Fernet.generate_key().decode()
    calls = []

    async def provider(path, *, data=None, token=""):
        calls.append((path, data, token))
        if path == "/oauth/token":
            return {
                "access_token": "fixture-access",
                "refresh_token": "fixture-refresh",
                "expires_in": 7200,
                "token_type": "Bearer",
                "scope": oauth.SCOPES,
            }
        if path == "/api/v4/user":
            return {"id": 42, "username": "alice", "name": "Alice"}
        return {}

    monkeypatch.setattr(oauth, "provider_request", provider)
    return calls


def sign_in(client):
    response = client.post("/api/auth/gitlab/start", headers=HEADERS, json={})
    assert response.status_code == 200
    params = parse_qs(urlparse(response.json()["authorization_url"]).query)
    callback = client.get(
        "/api/auth/gitlab/callback",
        params={"state": params["state"][0], "code": "fixture-code"},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == ORIGIN + "/settings?gitlab=connected"
    return params, callback


def test_pkce_encrypted_session_and_no_token_disclosure(client, oauth_config):
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/settings").json()["auth_mode"] == "gitlab"
    params, callback = sign_in(client)
    assert params["code_challenge_method"] == ["S256"]
    assert params["scope"] == ["read_api"]
    token_call = oauth_config[0][1]
    verifier = token_call["code_verifier"]
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    assert params["code_challenge"] == [expected]
    assert token_call["redirect_uri"] == ORIGIN + "/api/auth/gitlab/callback"
    assert "HttpOnly" in callback.headers["set-cookie"]
    assert "SameSite=lax" in callback.headers["set-cookie"]
    session = client.get("/api/auth/me").json()
    assert session["authenticated"] and session["user"]["username"] == "alice"
    assert "fixture-access" not in str(session)
    assert "fixture-refresh" not in str(session)
    assert client.get("/api/projects").json() == []
    with SessionLocal() as db:
        saved = db.scalars(select(LoginSession)).one()
        assert saved.access_cipher != "fixture-access"
        assert oauth.decrypt(saved.refresh_cipher) == "fixture-refresh"
        assert saved.id != client.cookies[oauth.SESSION_COOKIE]
        assert db.scalars(select(OAuthState)).all() == []


def test_callback_rejects_wrong_browser_state_expiry_and_replay(client, oauth_config):
    response = client.post("/api/auth/gitlab/start", headers=HEADERS)
    state = parse_qs(urlparse(response.json()["authorization_url"]).query)["state"][0]
    with TestClient(app) as other:
        assert (
            other.get(
                "/api/auth/gitlab/callback",
                params={"state": state, "code": "x"},
                follow_redirects=False,
            )
            .headers["location"]
            .endswith("gitlab=error")
        )
    good = client.get(
        "/api/auth/gitlab/callback", params={"state": state, "code": "x"}, follow_redirects=False
    )
    assert good.headers["location"].endswith("gitlab=connected")
    client.cookies.set(oauth.STATE_COOKIE, "wrong-browser")
    assert (
        client.get(
            "/api/auth/gitlab/callback",
            params={"state": state, "code": "x"},
            follow_redirects=False,
        )
        .headers["location"]
        .endswith("gitlab=error")
    )
    assert len([call for call in oauth_config if call[0] == "/oauth/token"]) == 1
    started = client.post("/api/auth/gitlab/start", headers=HEADERS)
    expired_state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
    with SessionLocal() as db:
        row = db.scalars(select(OAuthState)).one()
        row.expires_at = 1
        db.commit()
    assert (
        client.get(
            "/api/auth/gitlab/callback",
            params={"state": expired_state, "code": "x"},
            follow_redirects=False,
        )
        .headers["location"]
        .endswith("gitlab=error")
    )


def test_oauth_csrf_and_logout_even_when_provider_down(client, oauth_config, monkeypatch):
    assert (
        client.post(
            "/api/auth/gitlab/start", headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    sign_in(client)
    csrf = client.get("/api/auth/me").json()["csrf_token"]
    assert client.post("/api/projects", json={"gitlab_id": 1}, headers=HEADERS).status_code == 403
    assert (
        client.post("/api/auth/logout", headers={**HEADERS, "X-CSRF-Token": "wrong"}).status_code
        == 403
    )

    async def unavailable(*args, **kwargs):
        raise HTTPException(502, "Unavailable")

    monkeypatch.setattr(oauth, "provider_request", unavailable)
    # Logout must not try to refresh an expired or revoked access token.
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        row.token_expires_at = 1
        db.commit()
    response = client.post("/api/auth/logout", headers={**HEADERS, "X-CSRF-Token": csrf})
    assert response.status_code == 204
    assert response.headers["X-GitLab-Revocation"] == "pending-manual-revocation"
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/api/projects").status_code == 401


def test_logout_confirms_upstream_revocation_and_invalidates_cookie(client, oauth_config):
    sign_in(client)
    cookie = client.cookies[oauth.SESSION_COOKIE]
    csrf = client.get("/api/auth/me").json()["csrf_token"]
    response = client.post("/api/auth/logout", headers={**HEADERS, "X-CSRF-Token": csrf})
    assert response.status_code == 204
    assert response.headers["X-GitLab-Revocation"] == "revoked"
    assert oauth_config[-1][0] == "/oauth/revoke"
    assert oauth_config[-1][1]["token"] == "fixture-access"
    assert oauth.SESSION_COOKIE not in client.cookies
    with SessionLocal() as db:
        assert db.scalars(select(LoginSession)).all() == []
    # A captured cookie must no longer work after local logout.
    client.cookies.set(oauth.SESSION_COOKIE, cookie)
    assert client.get("/api/projects").status_code == 401


def test_logout_without_session_does_not_claim_gitlab_revocation(client, oauth_config):
    response = client.post("/api/auth/logout", headers=HEADERS)
    assert response.status_code == 204
    assert response.headers["X-GitLab-Revocation"] == "not-attempted"
    assert oauth_config == []


@pytest.mark.parametrize("scope", ["", "read_user", "read_repository", "api"])
async def test_token_exchange_requires_the_requested_read_api_scope(
    oauth_config, monkeypatch, scope
):
    async def provider(*args, **kwargs):
        return {
            "access_token": "fixture-access",
            "refresh_token": "fixture-refresh",
            "expires_in": 7200,
            "token_type": "Bearer",
            "scope": scope,
        }

    monkeypatch.setattr(oauth, "provider_request", provider)
    with pytest.raises(HTTPException) as denied:
        await oauth.tokens({"grant_type": "authorization_code", "code": "fixture-code"})
    assert denied.value.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/projects/unconnected/pipelines", None),
        ("GET", "/api/projects/unconnected/pipelines/1", None),
        ("GET", "/api/projects/unconnected/pipelines/1/jobs/2/trace", None),
        (
            "POST",
            "/api/analyses",
            {"project_id": "unconnected", "pipeline_id": 1, "job_id": 2},
        ),
    ],
)
def test_unconnected_project_is_rejected_before_gitlab_access(
    client, oauth_config, monkeypatch, method, path, body
):
    from unittest.mock import MagicMock

    from app.api import routes
    from app.services import pipelines

    sign_in(client)
    csrf = client.get("/api/auth/me").json()["csrf_token"]
    boundary = MagicMock(side_effect=AssertionError("No GitLab request is allowed"))
    monkeypatch.setattr(routes, "gitlab_client", boundary)
    monkeypatch.setattr(pipelines, "gitlab_client", boundary)
    response = client.request(method, path, headers={**HEADERS, "X-CSRF-Token": csrf}, json=body)
    assert response.status_code == 404
    boundary.assert_not_called()


def test_refresh_rotation_and_expired_session(client, oauth_config):
    sign_in(client)
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        row.token_expires_at = 1
        db.commit()
    assert client.get("/api/projects").status_code == 200
    assert oauth_config[-1][1]["grant_type"] == "refresh_token"
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        assert row.token_expires_at > time.time()
        assert row.refresh_claim is None
        row.expires_at = 1
        db.commit()
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/api/projects").status_code == 401


def test_refresh_failure_does_not_use_shared_server_token(client, oauth_config, monkeypatch):
    sign_in(client)
    get_settings().gitlab_token = "shared-token-must-never-be-used"
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        row.token_expires_at = 1
        db.commit()

    async def denied(*args, **kwargs):
        raise HTTPException(401, "Reconnect")

    monkeypatch.setattr(oauth, "provider_request", denied)
    assert client.get("/api/projects").status_code == 401
    with SessionLocal() as db:
        assert db.scalars(select(LoginSession)).all() == []


def test_two_users_cannot_read_mutate_or_list_each_others_data(client, oauth_config, monkeypatch):
    sign_in(client)
    with SessionLocal() as db:
        user_id = db.scalars(select(LoginSession)).one().user_id
        project = Project(
            id=str(uuid4()),
            owner_id=user_id,
            gitlab_id=1,
            name="team/private",
            web_url="https://gitlab.com/team/private",
            source="live",
        )
        db.add(project)
        db.commit()
        analysis_id = str(uuid4())
        db.add(
            Analysis(
                id=analysis_id,
                owner_id=user_id,
                project_id=project.id,
                pipeline_id=1,
                job_id=2,
                job_name="build",
                source="live",
                diagnosis=diagnosis(1048),
                pipeline={"id": 1},
            )
        )
        db.commit()
        project_id = project.id
    assert len(client.get("/api/projects").json()) == 1
    assert client.get(f"/api/analyses/{analysis_id}").status_code == 200
    original = oauth.provider_request

    async def bob(path, **kwargs):
        if path == "/api/v4/user":
            return {"id": 99, "username": "bob", "name": "Bob"}
        return await original(path, **kwargs)

    monkeypatch.setattr(oauth, "provider_request", bob)
    with TestClient(app) as other:
        sign_in(other)
        csrf = other.get("/api/auth/me").json()["csrf_token"]
        headers = {**HEADERS, "X-CSRF-Token": csrf}
        assert other.get("/api/projects").json() == []
        assert other.get("/api/analyses").json() == []
        assert other.get(f"/api/analyses/{analysis_id}").status_code == 404
        assert other.delete(f"/api/analyses/{analysis_id}", headers=headers).status_code == 404
        assert (
            other.post(
                f"/api/analyses/{analysis_id}/messages",
                headers=headers,
                json={"message": "show private context"},
            ).status_code
            == 404
        )
        assert other.get(f"/api/projects/{project_id}/pipelines").status_code == 404
        assert (
            other.post(
                "/api/analyses",
                headers=headers,
                json={"project_id": project_id, "pipeline_id": 1, "job_id": 2},
            ).status_code
            == 404
        )
    # ContextVar must be restored after the other browser's request.
    assert client.get(f"/api/analyses/{analysis_id}").status_code == 200


def test_session_token_redaction_is_request_scoped():
    marker = identity.set(
        Identity(
            owner_id="alice",
            access_token="opaque-access-value",
            refresh_token="opaque-refresh-value",
        )
    )
    try:
        assert redact("opaque-access-value opaque-refresh-value") == "[REDACTED] [REDACTED]"
    finally:
        identity.reset(marker)
    assert identity.get().owner_id is None


def test_https_and_complete_config_required():
    config = {
        "auth_mode": "gitlab",
        "demo_mode": False,
        "gitlab_client_id": "fixture",
        "gitlab_client_secret": "fixture",
        "token_encryption_key": Fernet.generate_key().decode(),
    }
    assert Settings(**config).auth_mode == "gitlab"
    with pytest.raises(ValidationError):
        Settings(**(config | {"public_app_url": "http://public.example"}))
    with pytest.raises(ValidationError):
        Settings(**(config | {"token_encryption_key": "invalid"}))
    with pytest.raises(ValidationError):
        Settings(**(config | {"demo_mode": True}))


async def test_gitlab_oauth_wire_protocol(monkeypatch):
    seen = []
    real_client = httpx.AsyncClient

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"access_token": "fixture"})

    monkeypatch.setattr(
        oauth.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(handler)),
    )
    await oauth.provider_request("/oauth/token", data={"code": "fixture-code"})
    await oauth.provider_request("/api/v4/user", token="fixture-access")
    assert b"code=fixture-code" in seen[0].content
    assert seen[1].headers["authorization"] == "Bearer fixture-access"
    assert "fixture-access" not in str(seen[1].url)


def test_wrong_browser_cookie_does_not_consume_state(client, oauth_config):
    started = client.post("/api/auth/gitlab/start", headers=HEADERS)
    state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
    with TestClient(app) as other:
        other.cookies.set(oauth.STATE_COOKIE, "attacker-cookie")
        result = other.get(
            "/api/auth/gitlab/callback",
            params={"state": state, "code": "x"},
            follow_redirects=False,
        )
        assert result.headers["location"].endswith("gitlab=error")
    assert oauth_config == []
    assert (
        client.get(
            "/api/auth/gitlab/callback",
            params={"state": state, "code": "x"},
            follow_redirects=False,
        )
        .headers["location"]
        .endswith("gitlab=connected")
    )


def test_refresh_lease_rejects_duplicate_requests_and_recovers_stale_claim(client, oauth_config):
    sign_in(client)
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        row.token_expires_at = 1
        row.refresh_claim = "another-worker"
        row.refresh_started_at = int(time.time())
        db.commit()
    result = client.get("/api/projects")
    assert result.status_code == 503
    assert result.headers["Retry-After"] == "2"
    assert len([call for call in oauth_config if call[0] == "/oauth/token"]) == 1
    with SessionLocal() as db:
        row = db.scalars(select(LoginSession)).one()
        row.refresh_started_at = int(time.time()) - 100
        db.commit()
    assert client.get("/api/projects").status_code == 200


def test_oauth_uses_secure_cookie_on_https(oauth_config):
    get_settings().public_app_url = HttpUrl("https://testserver")
    with TestClient(app, base_url="https://testserver") as browser:
        started = browser.post("/api/auth/gitlab/start", headers={"Origin": "https://testserver"})
        assert "Secure" in started.headers["set-cookie"]
        state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
        callback = browser.get(
            "/api/auth/gitlab/callback",
            params={"state": state, "code": "x"},
            follow_redirects=False,
        )
        assert "Secure" in callback.headers["set-cookie"]
        assert browser.get("/api/auth/me").json()["authenticated"]


def test_same_gitlab_project_is_connected_separately_for_each_user(
    client, oauth_config, monkeypatch
):
    from unittest.mock import AsyncMock

    from app.integrations.gitlab import GitLabClient

    monkeypatch.setattr(
        GitLabClient,
        "project",
        AsyncMock(
            return_value={
                "id": 1,
                "path_with_namespace": "team/shared",
                "web_url": "https://gitlab.com/team/shared",
            }
        ),
    )
    sign_in(client)
    csrf = client.get("/api/auth/me").json()["csrf_token"]
    alice = client.post(
        "/api/projects", headers={**HEADERS, "X-CSRF-Token": csrf}, json={"gitlab_id": 1}
    ).json()
    original = oauth.provider_request

    async def bob(path, **kwargs):
        return (
            {"id": 99, "username": "bob"}
            if path == "/api/v4/user"
            else await original(path, **kwargs)
        )

    monkeypatch.setattr(oauth, "provider_request", bob)
    with TestClient(app) as other:
        sign_in(other)
        csrf = other.get("/api/auth/me").json()["csrf_token"]
        project = other.post(
            "/api/projects", headers={**HEADERS, "X-CSRF-Token": csrf}, json={"gitlab_id": 1}
        ).json()
        assert project["id"] != alice["id"]
        assert other.get("/api/projects").json() == [project]
    assert client.get("/api/projects").json() == [alice]
