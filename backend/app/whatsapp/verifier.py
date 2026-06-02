from fastapi import HTTPException, status


def verify_webhook(mode: str | None, token: str | None, challenge: str | None, expected: str) -> str:
    if expected and mode == "subscribe" and token == expected and challenge is not None:
        return challenge
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Webhook verification failed",
    )
