import json
import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.ai.diagnostician import AIUnavailable
from app.api.auth import router as auth_router
from app.api.routes import router, settings_router
from app.core.config import get_settings
from app.core.database import SessionLocal, engine, prune
from app.integrations.gitlab import GitLabError
from app.services.oauth import authenticated_context

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("doctor")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed exclusively by Alembic, not create_all on app startup.
    with SessionLocal() as db:
        prune(db)
    yield
    engine.dispose()


app = FastAPI(title="Pipeline Doctor AI", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)
app.include_router(settings_router, prefix="/api")
app.include_router(auth_router)
app.include_router(router, prefix="/api", dependencies=[Depends(authenticated_context)])


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - start) * 1000),
            }
        )
    )
    return response


@app.exception_handler(GitLabError)
async def gitlab_error(request, exc: GitLabError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.exception_handler(AIUnavailable)
async def ai_error(request, exc: AIUnavailable):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unexpected_error(request, exc: Exception):
    logger.error(json.dumps({"event": "request_failed", "error_type": type(exc).__name__}))
    return JSONResponse(
        status_code=500,
        content={"detail": "Unexpected server error; check backend health and configuration"},
    )


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503, content={"status": "unhealthy", "database": "unavailable"}
        )
    return {
        "status": "ok",
        "database": "connected",
        "mode": "demo" if get_settings().demo_mode else "live",
    }
