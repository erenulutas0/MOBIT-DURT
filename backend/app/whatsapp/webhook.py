from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.ingestion.pipeline import IngestionPipeline
from app.whatsapp.parser import parse_whatsapp_webhook
from app.whatsapp.verifier import verify_webhook


router = APIRouter(prefix="/webhook/whatsapp", tags=["whatsapp"])


def get_pipeline(request: Request, settings: Settings = Depends(get_settings)) -> IngestionPipeline:
    pipeline = getattr(request.app.state, "ingestion_pipeline", None)
    if pipeline is None:
        pipeline = IngestionPipeline(settings)
        request.app.state.ingestion_pipeline = pipeline
    return pipeline


@router.get("", response_class=PlainTextResponse)
def verify(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    settings: Settings = Depends(get_settings),
) -> str:
    return verify_webhook(
        hub_mode,
        hub_verify_token,
        hub_challenge,
        settings.whatsapp_verify_token,
    )


@router.post("")
async def receive(
    request: Request,
    db: Session = Depends(get_db),
    pipeline: IngestionPipeline = Depends(get_pipeline),
) -> dict:
    payload = await request.json()
    incoming_messages = parse_whatsapp_webhook(payload)
    documents = [await pipeline.process(db, message) for message in incoming_messages]
    return {
        "received": len(incoming_messages),
        "processed": len(documents),
        "document_ids": [document.id for document in documents],
    }
