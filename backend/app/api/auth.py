import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.entities import User
from app.services import oauth

router = APIRouter(prefix="/api/auth")


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    mode = get_settings().auth_mode
    row = oauth.session_for(request, db) if mode == "gitlab" else None
    user = db.get(User, row.user_id) if row else None
    if user and user.instance_url != str(get_settings().gitlab_url).rstrip("/"):
        user = None
    return {
        "mode": mode,
        "authenticated": bool(user),
        "user": {"username": user.username, "name": user.name} if user else None,
        "csrf_token": row.csrf_token if user else None,
    }


@router.post("/gitlab/start")
def start(request: Request, response: Response, db: Session = Depends(get_db)):
    if get_settings().auth_mode != "gitlab":
        raise HTTPException(503, "GitLab OAuth is not enabled by the server administrator")
    oauth.assert_origin(request)
    url, browser = oauth.start(db)
    response.set_cookie(
        oauth.STATE_COOKIE,
        browser,
        max_age=600,
        httponly=True,
        secure=oauth.secure_cookie(),
        samesite="lax",
        path="/",
    )
    return {"authorization_url": url}


@router.get("/gitlab/callback")
async def callback(
    request: Request,
    state: str = Query("", max_length=128),
    code: str = Query("", max_length=2048),
    error: str = Query("", max_length=255),
    db: Session = Depends(get_db),
):
    if get_settings().auth_mode != "gitlab":
        raise HTTPException(503, "GitLab OAuth is not enabled")
    response = RedirectResponse(oauth.app_origin() + "/settings?gitlab=error", status_code=303)
    response.delete_cookie(
        oauth.STATE_COOKIE, path="/", secure=oauth.secure_cookie(), httponly=True, samesite="lax"
    )
    browser = request.cookies.get(oauth.STATE_COOKIE, "")
    if error or not code or not state or not browser:
        return response
    try:
        raw = await oauth.finish(db, state, browser, code)
    except HTTPException:
        return response
    previous = oauth.session_for(request, db)
    if previous:
        db.delete(previous)
        db.commit()
    response.headers["location"] = oauth.app_origin() + "/settings?gitlab=connected"
    response.set_cookie(
        oauth.SESSION_COOKIE,
        raw,
        max_age=get_settings().session_days * 86400,
        httponly=True,
        secure=oauth.secure_cookie(),
        samesite="lax",
        path="/",
    )
    return response


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    if get_settings().auth_mode != "gitlab":
        raise HTTPException(400, "No GitLab login session in local mode")
    oauth.assert_origin(request)
    row = oauth.session_for(request, db)
    response.headers["X-GitLab-Revocation"] = "not-attempted"
    if row:
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode(), row.csrf_token.encode()
        ):
            raise HTTPException(403, "Invalid CSRF token; reload the page")
        # End the local session even if GitLab cannot revoke the grant right now.
        access_cipher = row.access_cipher
        db.delete(row)
        db.commit()
        try:
            await oauth.provider_request(
                "/oauth/revoke",
                data={
                    **oauth.client_credentials(),
                    "token": oauth.decrypt(access_cipher),
                },
            )
            response.headers["X-GitLab-Revocation"] = "revoked"
        except HTTPException:
            response.headers["X-GitLab-Revocation"] = "pending-manual-revocation"
    response.delete_cookie(
        oauth.SESSION_COOKIE, path="/", secure=oauth.secure_cookie(), httponly=True, samesite="lax"
    )
