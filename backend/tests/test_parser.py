import json
from pathlib import Path

from app.whatsapp.parser import parse_whatsapp_webhook


def test_parser_extracts_media_and_ignores_text_messages():
    payload = json.loads(
        Path("tests/fixtures/whatsapp_document_payload.json").read_text(encoding="utf-8")
    )

    messages = parse_whatsapp_webhook(payload)

    assert len(messages) == 1
    message = messages[0]
    assert message.message_id == "wamid.TEST-DOCUMENT"
    assert message.sender == "905551112233"
    assert message.media_id == "media-123"
    assert message.mime_type == "application/pdf"
    assert message.filename == "BEDAS-2025-teknik-sartname.pdf"
    assert message.caption == "BEDAŞ 2025 teknik şartname"
    assert message.message_type == "document"
