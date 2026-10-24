import stat

import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.services import oauth


def test_public_local_oauth_generates_and_reuses_private_key(tmp_path):
    path = tmp_path / "private" / "oauth.key"
    config = {
        "auth_mode": "gitlab",
        "demo_mode": False,
        "gitlab_oauth_public": True,
        "gitlab_client_id": "fixture-public-app",
        "gitlab_client_secret": "",
        "token_encryption_key": "",
        "oauth_key_file": path,
    }
    first = Settings(**config)
    assert first.token_encryption_key == Settings(**config).token_encryption_key
    assert first.token_encryption_key == path.read_text().strip()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert first.gitlab_client_secret == ""
    path.write_text("invalid-existing-key")
    with pytest.raises(ValidationError):
        Settings(**config)
    assert path.read_text() == "invalid-existing-key"


def test_public_app_registration_is_instance_bound(tmp_path, monkeypatch):
    from app.core import local_oauth

    registration = tmp_path / "registration.json"
    registration.write_text(
        '{"instance_url":"https://gitlab.com", "client_id":"fixture-public-id"}'
    )
    monkeypatch.setattr(local_oauth, "REGISTRATION", registration)
    assert local_oauth.registered_client_id("https://gitlab.com/") == "fixture-public-id"
    assert local_oauth.registered_client_id("https://gitlab.internal/") == ""
    settings = Settings(
        auth_mode="gitlab",
        demo_mode=False,
        gitlab_oauth_public=True,
        gitlab_client_id="",
        token_encryption_key="",
        oauth_key_file=tmp_path / "key",
    )
    assert settings.gitlab_client_id == "fixture-public-id"


async def test_public_pkce_token_exchange_never_sends_a_client_secret(monkeypatch):
    settings = get_settings()
    settings.gitlab_oauth_public = True
    settings.gitlab_client_id = "fixture-public-id"
    settings.gitlab_client_secret = "must-not-be-sent"
    captured = []

    async def request(path, **kwargs):
        captured.append(kwargs["data"])
        return {
            "access_token": "fixture-access",
            "refresh_token": "fixture-refresh",
            "expires_in": 7200,
            "token_type": "bearer",
        }

    monkeypatch.setattr(oauth, "provider_request", request)
    await oauth.tokens(
        {
            "grant_type": "authorization_code",
            "code": "fixture-code",
            "code_verifier": "fixture-verifier",
        }
    )
    await oauth.tokens({"grant_type": "refresh_token", "refresh_token": "fixture-refresh"})
    assert all("client_secret" not in data for data in captured)
    assert captured[0]["code_verifier"] == "fixture-verifier"
