from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, delete, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


url = get_settings().database_url
engine = create_engine(
    url,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
)
if url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session


def prune(session: Session) -> None:
    from app.models.entities import Analysis

    cutoff = datetime.now(UTC) - timedelta(days=get_settings().retention_days)
    session.execute(delete(Analysis).where(Analysis.created_at < cutoff))
    session.commit()
