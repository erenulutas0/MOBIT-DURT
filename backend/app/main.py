from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import Document
from app.utils.logging import configure_logging
from app.whatsapp.webhook import router as whatsapp_router


class DocumentOut(BaseModel):
    id: int
    message_id: str
    sender_hash: str
    source: str
    timestamp: datetime
    media_id: str
    mime_type: str | None
    original_filename: str | None
    stored_filename: str | None
    caption: str | None
    checksum: str | None
    file_path: str | None
    file_size: int | None
    organization: str | None
    year: int | None
    tender_id: str
    document_type: str
    status: str
    error_message: str | None

    model_config = {"from_attributes": True}


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    init_db()
    yield


app = FastAPI(title="Tender Knowledge Hub", version="0.1.0", lifespan=lifespan)
app.include_router(whatsapp_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/documents", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return db.query(Document).order_by(Document.created_at.desc(), Document.id.desc()).all()


@app.get("/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, db: Session = Depends(get_db)) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document
