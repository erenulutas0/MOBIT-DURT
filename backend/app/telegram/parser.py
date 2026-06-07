from datetime import UTC, datetime
from typing import Any

from app.whatsapp.parser import IncomingMediaMessage


def parse_telegram_update(update: dict[str, Any]) -> IncomingMediaMessage | None:
    message = update.get("message") or update.get("channel_post")
    if not message:
        return None

    chat = message.get("chat", {})
    sender = message.get("from", {})
    chat_id = chat.get("id")
    message_id = message.get("message_id")
    sender_id = sender.get("id") or chat_id
    if chat_id is None or message_id is None or sender_id is None:
        return None

    timestamp = _parse_timestamp(message.get("date"))
    caption = message.get("caption")
    base_id = f"telegram:{chat_id}:{message_id}"

    if document := message.get("document"):
        file_id = document.get("file_id")
        if not file_id:
            return None
        return IncomingMediaMessage(
            message_id=base_id,
            sender=f"telegram:{sender_id}",
            timestamp=timestamp,
            media_id=file_id,
            mime_type=document.get("mime_type"),
            filename=document.get("file_name"),
            caption=caption,
            message_type="document",
            source="telegram",
        )

    if photos := message.get("photo"):
        largest = max(photos, key=lambda item: item.get("file_size", 0))
        file_id = largest.get("file_id")
        if not file_id:
            return None
        return IncomingMediaMessage(
            message_id=base_id,
            sender=f"telegram:{sender_id}",
            timestamp=timestamp,
            media_id=file_id,
            mime_type="image/jpeg",
            filename=None,
            caption=caption,
            message_type="image",
            source="telegram",
        )

    if video := message.get("video"):
        return _media_message(base_id, sender_id, timestamp, video, caption, "video")

    if audio := message.get("audio"):
        return _media_message(base_id, sender_id, timestamp, audio, caption, "audio")

    return None


def _media_message(
    message_id: str,
    sender_id: int,
    timestamp: datetime,
    media: dict[str, Any],
    caption: str | None,
    message_type: str,
) -> IncomingMediaMessage | None:
    file_id = media.get("file_id")
    if not file_id:
        return None
    return IncomingMediaMessage(
        message_id=message_id,
        sender=f"telegram:{sender_id}",
        timestamp=timestamp,
        media_id=file_id,
        mime_type=media.get("mime_type"),
        filename=media.get("file_name"),
        caption=caption,
        message_type=message_type,
        source="telegram",
    )


def _parse_timestamp(value: int | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    try:
        return datetime.fromtimestamp(value, tz=UTC)
    except (TypeError, ValueError, OSError):
        return datetime.now(UTC)
