"""GitLab OAuth code+PKCE, encrypted credentials and bounded refresh leases."""

import base64
import hashlib
import secrets
import time
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, uuid4, uuid5

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, or_, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.identity import Identity, identity
from app.models.entities import LoginSession, OAuthState, User

SESSION_COOKIE = "pd_session"
STATE_COOKIE = "pd_oauth"
SCOPES = "read_user read_api read_repository"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def encrypt(value: str) -> str:
    return Fernet(get_settings().token_encryption_key.encode()).encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return Fernet(get_settings().token_encryption_key.encode()).decrypt(value.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise HTTPException(
            503, "Unable to read OAuth credentials; check server encryption key"
        ) from exc


def app_origin() -> str:
    return str(get_settings().public_app_url).rstrip("/")


def callback_uri() -> str:
    return app_origin() + "/api/auth/gitlab/callback"


def secure_cookie() -> bool:
    return get_settings().public_app_url.scheme == "https"


def assert_origin(request: Request):
    if request.headers.get("origin") != app_origin():
        raise HTTPException(403, "Request origin does not match PUBLIC_APP_URL")


def session_for(request: Request, db: Session) -> LoginSession | None:
    raw = request.cookies.get(SESSION_COOKIE, "")
    if not raw or len(raw) > 128:
        return None
    row = db.get(LoginSession, digest(raw))
    if row and row.expires_at <= int(time.time()):
        db.delete(row)
        db.commit()
        return None
    return row


async def provider_request(path: str, *, data=None, token: str = ""):
    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20, connect=5), follow_redirects=False
        ) as client:
            url = str(settings.gitlab_url).rstrip("/") + path
            response = await (
                client.post(url, data=data)
                if data is not None
                else client.get(url, headers={"Authorization": f"Bearer {token}"})
            )
        if response.status_code in (400, 401, 403):
            raise HTTPException(
                401, "GitLab authorization expired or was denied; reconnect your account"
            )
        if not response.is_success:
            raise HTTPException(502, "GitLab OAuth is temporarily unavailable")
        if path == "/oauth/revoke" and not response.content:
            return {}
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "GitLab OAuth request failed; retry later") from exc


async def tokens(data: dict) -> dict:
    result = await provider_request(
        "/oauth/token",
        data={
            **client_credentials(),
            "redirect_uri": callback_uri(),
            **data,
        },
    )
    if (
        not isinstance(result, dict)
        or not all(
            isinstance(result.get(key), str) and result[key]
            for key in ("access_token", "refresh_token")
        )
        or not isinstance(result.get("expires_in"), int)
        or result["expires_in"] <= 0
        or str(result.get("token_type", "")).lower() != "bearer"
    ):
        raise HTTPException(502, "GitLab returned incomplete OAuth credentials")
    if "scope" in result and not set(SCOPES.split()).issubset(str(result["scope"]).split()):
        raise HTTPException(401, "GitLab did not grant the required read-only scopes")
    return result


def client_credentials() -> dict[str, str]:
    settings = get_settings()
    credentials = {"client_id": settings.gitlab_client_id}
    if not settings.gitlab_oauth_public:
        credentials["client_secret"] = settings.gitlab_client_secret
    return credentials


def start(db: Session) -> tuple[str, str]:
    now = int(time.time())
    db.execute(delete(OAuthState).where(OAuthState.expires_at <= now))
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    state, browser, verifier = (secrets.token_urlsafe(48) for _ in range(3))
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    db.add(
        OAuthState(
            id=digest(state),
            browser_hash=digest(browser),
            verifier_cipher=encrypt(verifier),
            expires_at=now + 600,
        )
    )
    db.commit()
    params = {
        "client_id": get_settings().gitlab_client_id,
        "redirect_uri": callback_uri(),
        "response_type": "code",
        "state": state,
        "scope": SCOPES,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return str(get_settings().gitlab_url).rstrip("/") + "/oauth/authorize?" + urlencode(
        params
    ), browser


async def finish(db: Session, state: str, browser: str, code: str) -> str:
    row = db.get(OAuthState, digest(state))
    if (
        not row
        or row.expires_at <= int(time.time())
        or not secrets.compare_digest(row.browser_hash, digest(browser))
    ):
        raise HTTPException(400, "Invalid or expired OAuth state; start again")
    verifier = decrypt(row.verifier_cipher)
    # Atomic one-time consumption prevents replay, including concurrent callbacks.
    consumed = db.execute(delete(OAuthState).where(OAuthState.id == row.id))
    db.commit()
    if consumed.rowcount != 1:
        raise HTTPException(400, "OAuth state has already been used")
    result = await tokens(
        {"grant_type": "authorization_code", "code": code, "code_verifier": verifier}
    )
    profile = await provider_request("/api/v4/user", token=result["access_token"])
    if (
        not isinstance(profile, dict)
        or not isinstance(profile.get("id"), int)
        or not isinstance(profile.get("username"), str)
    ):
        raise HTTPException(502, "GitLab returned an invalid user profile")
    instance = str(get_settings().gitlab_url).rstrip("/")
    user_id = str(uuid5(NAMESPACE_URL, f"{instance}/users/{profile['id']}"))
    user = db.get(User, user_id)
    if user is None:
        user = User(
            id=user_id,
            instance_url=instance,
            gitlab_id=profile["id"],
            username=profile["username"][:255],
            name=str(profile.get("name") or profile["username"])[:500],
        )
        db.add(user)
        db.flush()
    else:
        user.username = profile["username"][:255]
        user.name = str(profile.get("name") or profile["username"])[:500]
    raw = secrets.token_urlsafe(48)
    now = int(time.time())
    db.add(
        LoginSession(
            id=digest(raw),
            user_id=user_id,
            access_cipher=encrypt(result["access_token"]),
            refresh_cipher=encrypt(result["refresh_token"]),
            token_expires_at=now + result["expires_in"],
            expires_at=now + get_settings().session_days * 86400,
            csrf_token=secrets.token_urlsafe(32),
        )
    )
    db.commit()
    return raw


async def access_credentials(db: Session, row: LoginSession) -> tuple[str, str]:
    now = int(time.time())
    if row.token_expires_at > now + 60:
        return decrypt(row.access_cipher), decrypt(row.refresh_cipher)
    row_id, refresh = row.id, decrypt(row.refresh_cipher)
    previous_cipher = row.refresh_cipher
    claim = str(uuid4())
    claimed = db.execute(
        update(LoginSession)
        .where(
            LoginSession.id == row_id,
            LoginSession.refresh_cipher == previous_cipher,
            LoginSession.token_expires_at <= now + 60,
            or_(LoginSession.refresh_claim.is_(None), LoginSession.refresh_started_at < now - 90),
        )
        .values(refresh_claim=claim, refresh_started_at=now)
    )
    db.commit()
    if claimed.rowcount != 1:
        db.expire_all()
        current = db.get(LoginSession, row_id)
        if not current:
            raise HTTPException(401, "Session ended; sign in again")
        if current.token_expires_at > int(time.time()) + 60:
            return decrypt(current.access_cipher), decrypt(current.refresh_cipher)
        raise HTTPException(
            503, "GitLab credentials are refreshing; retry shortly", headers={"Retry-After": "2"}
        )
    try:
        result = await tokens({"grant_type": "refresh_token", "refresh_token": refresh})
    except HTTPException as exc:
        if exc.status_code == 401:
            db.execute(
                delete(LoginSession).where(
                    LoginSession.id == row_id, LoginSession.refresh_claim == claim
                )
            )
        else:
            db.execute(
                update(LoginSession)
                .where(LoginSession.id == row_id, LoginSession.refresh_claim == claim)
                .values(refresh_claim=None, refresh_started_at=None)
            )
        db.commit()
        raise
    updated = db.execute(
        update(LoginSession)
        .where(LoginSession.id == row_id, LoginSession.refresh_claim == claim)
        .values(
            access_cipher=encrypt(result["access_token"]),
            refresh_cipher=encrypt(result["refresh_token"]),
            token_expires_at=int(time.time()) + result["expires_in"],
            refresh_claim=None,
            refresh_started_at=None,
        )
    )
    db.commit()
    if updated.rowcount != 1:
        raise HTTPException(401, "Session ended; sign in again")
    return result["access_token"], result["refresh_token"]


async def authenticated_context(request: Request, db: Session = Depends(get_db)):
    settings = get_settings()
    principal = Identity()
    if settings.auth_mode == "gitlab":
        row = session_for(request, db)
        user = db.get(User, row.user_id) if row else None
        if not row or not user or user.instance_url != str(settings.gitlab_url).rstrip("/"):
            raise HTTPException(401, "Sign in with GitLab to access your workspace")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            assert_origin(request)
            if not secrets.compare_digest(
                request.headers.get("x-csrf-token", "").encode(), row.csrf_token.encode()
            ):
                raise HTTPException(403, "Invalid CSRF token; reload the page")
        access, refresh = await access_credentials(db, row)
        principal = Identity(owner_id=user.id, access_token=access, refresh_token=refresh)
    else:
        from app.api.routes import authorized

        authorized(request.headers.get("authorization"))
    marker = identity.set(principal)
    try:
        yield principal
    finally:
        identity.reset(marker)
