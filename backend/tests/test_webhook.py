import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


class FakePipeline:
    async def process(self, db, incoming):
        return SimpleNamespace(id=42)


def test_webhook_verification_accepts_matching_token():
    app.dependency_overrides[get_settings] = lambda: Settings(
        WHATSAPP_VERIFY_TOKEN="local-verify-token"
    )
    try:
        with TestClient(app) as client:
            response = client.get(
                "/webhook/whatsapp",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "local-verify-token",
                    "hub.challenge": "challenge-value",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.text == "challenge-value"


def test_webhook_verification_rejects_unconfigured_token():
    app.dependency_overrides[get_settings] = lambda: Settings(WHATSAPP_VERIFY_TOKEN="")
    try:
        with TestClient(app) as client:
            response = client.get(
                "/webhook/whatsapp",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "",
                    "hub.challenge": "challenge-value",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_webhook_post_parses_payload_without_real_api_calls():
    payload = json.loads(
        Path("tests/fixtures/whatsapp_document_payload.json").read_text(encoding="utf-8")
    )
    app.state.ingestion_pipeline = FakePipeline()

    try:
        with TestClient(app) as client:
            response = client.post("/webhook/whatsapp", json=payload)
    finally:
        if hasattr(app.state, "ingestion_pipeline"):
            delattr(app.state, "ingestion_pipeline")

    assert response.status_code == 200
    assert response.json() == {"received": 1, "processed": 1, "document_ids": [42]}
