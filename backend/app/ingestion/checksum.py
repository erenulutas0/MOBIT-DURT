import hashlib


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def hash_sender(sender: str, salt: str = "") -> str:
    return hashlib.sha256(f"{salt}:{sender}".encode("utf-8")).hexdigest()
