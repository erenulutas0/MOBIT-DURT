from dataclasses import dataclass
from datetime import datetime


class MediaDownloadError(RuntimeError):
    pass


@dataclass(frozen=True)
class DownloadedMedia:
    content: bytes
    mime_type: str | None
    file_size: int


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
    source: str = "telegram"
