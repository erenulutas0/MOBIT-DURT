from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import Document, Tender
from app.utils.logging import configure_logging
from app.whatsapp.webhook import router as whatsapp_router
from app.dashboard.router import router as dashboard_router


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
    internal_unit: str | None
    organization: str | None
    year: int | None
    tender_id: str
    document_type: str
    status: str
    error_message: str | None

    model_config = {"from_attributes": True}


class TenderOut(BaseModel):
    id: int
    tender_id: str
    organization: str
    year: int
    sequence: int
    internal_unit: str | None
    title: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    init_db()
    yield


app = FastAPI(title="Tender Knowledge Hub", version="0.1.0", lifespan=lifespan)
app.include_router(whatsapp_router)
app.include_router(dashboard_router)


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


@app.get("/tenders", response_model=list[TenderOut])
def list_tenders(db: Session = Depends(get_db)) -> list[Tender]:
    return db.query(Tender).order_by(Tender.year.desc(), Tender.tender_id).all()


@app.get("/tenders/{tender_id}", response_model=TenderOut)
def get_tender(tender_id: str, db: Session = Depends(get_db)) -> Tender:
    tender = db.query(Tender).filter(Tender.tender_id == tender_id).one_or_none()
    if tender is None:
        raise HTTPException(status_code=404, detail="Tender not found")
    return tender
