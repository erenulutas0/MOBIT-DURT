from app.telegram.parser import parse_telegram_update


def test_telegram_parser_extracts_document_message():
    update = {
        "update_id": 1,
        "message": {
            "message_id": 55,
            "date": 1780300800,
            "chat": {"id": -100123, "type": "group"},
            "from": {"id": 987},
            "caption": "BEDAŞ 2026 teknik şartname",
            "document": {
                "file_id": "telegram-file-id",
                "file_name": "BEDAS-2026-teknik-sartname.pdf",
                "mime_type": "application/pdf",
            },
        },
    }

    message = parse_telegram_update(update)

    assert message is not None
    assert message.message_id == "telegram:-100123:55"
    assert message.sender == "telegram:987"
    assert message.media_id == "telegram-file-id"
    assert message.filename == "BEDAS-2026-teknik-sartname.pdf"
    assert message.caption == "BEDAŞ 2026 teknik şartname"
    assert message.source == "telegram"


def test_telegram_parser_ignores_text_only_messages():
    update = {
        "update_id": 1,
        "message": {
            "message_id": 56,
            "date": 1780300800,
            "chat": {"id": -100123, "type": "group"},
            "from": {"id": 987},
            "text": "hello",
        },
    }

    assert parse_telegram_update(update) is None
