from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


SUPPORTED_MESSAGE_TYPES = {"document", "image", "video", "audio"}


@dataclass(frozen=True)
class IncomingMediaMessage:
    message_id: str
    sender: str
    timestamp: datetime
    media_id: str
    mime_type: str | None
    filename: str | None
    caption: str | None
    message_type: str
    source: str = "whatsapp"


def parse_whatsapp_webhook(payload: dict[str, Any]) -> list[IncomingMediaMessage]:
    messages: list[IncomingMediaMessage] = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for raw_message in value.get("messages", []):
                message_type = raw_message.get("type")
                if message_type not in SUPPORTED_MESSAGE_TYPES:
                    continue

                media = raw_message.get(message_type, {})
                media_id = media.get("id")
                sender = raw_message.get("from")
                message_id = raw_message.get("id")
                if not (media_id and sender and message_id):
                    continue

                messages.append(
                    IncomingMediaMessage(
                        message_id=message_id,
                        sender=sender,
                        timestamp=_parse_timestamp(raw_message.get("timestamp")),
                        media_id=media_id,
                        mime_type=media.get("mime_type"),
                        filename=media.get("filename"),
                        caption=media.get("caption"),
                        message_type=message_type,
                    )
                )

    return messages


def _parse_timestamp(value: str | int | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return datetime.now(UTC)
