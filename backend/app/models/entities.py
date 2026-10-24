from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("instance_url", "gitlab_id", name="uq_user_gitlab_identity"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instance_url: Mapped[str] = mapped_column(String(2000))
    gitlab_id: Mapped[int] = mapped_column(BigInteger)
    username: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(500))


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    access_cipher: Mapped[str] = mapped_column(Text)
    refresh_cipher: Mapped[str] = mapped_column(Text)
    token_expires_at: Mapped[int] = mapped_column(BigInteger)
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    refresh_claim: Mapped[str | None] = mapped_column(String(36))
    refresh_started_at: Mapped[int | None] = mapped_column(BigInteger)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    browser_hash: Mapped[str] = mapped_column(String(64))
    verifier_cipher: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    gitlab_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(String(500))
    web_url: Mapped[str] = mapped_column(String(2000))
    source: Mapped[str] = mapped_column(String(10))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    pipeline_id: Mapped[int] = mapped_column(BigInteger)
    job_id: Mapped[int] = mapped_column(BigInteger)
    job_name: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(10), index=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    diagnosis: Mapped[dict[str, Any]] = mapped_column(JSON)
    pipeline: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    messages: Mapped[list["Message"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(12))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
