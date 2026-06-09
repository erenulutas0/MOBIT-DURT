from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
if settings.resolved_database_url.startswith("sqlite:///"):
    sqlite_path = settings.resolved_database_url.removeprefix("sqlite:///")
    Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.resolved_database_url,
    connect_args={"check_same_thread": False}
    if settings.resolved_database_url.startswith("sqlite")
    else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    from app import models  # noqa: F401
    from app.tenders.service import seed_tender_organizations

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    with SessionLocal() as db:
        seed_tender_organizations(db)


def _ensure_sqlite_columns() -> None:
    if not settings.resolved_database_url.startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return

    with engine.begin() as connection:
        columns = {column["name"] for column in inspector.get_columns("documents")}
        if "stored_filename" not in columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN stored_filename VARCHAR(255)"))
        if "internal_unit" not in columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN internal_unit VARCHAR(64)"))

        if "tenders" in inspector.get_table_names():
            tender_columns = {column["name"] for column in inspector.get_columns("tenders")}
            if "internal_unit" not in tender_columns:
                connection.execute(text("ALTER TABLE tenders ADD COLUMN internal_unit VARCHAR(64)"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
