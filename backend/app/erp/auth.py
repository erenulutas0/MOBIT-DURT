import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import ERPAccountRequest, ERPUser


HASH_ITERATIONS = 120_000


@dataclass(frozen=True)
class SessionIdentity:
    role: str
    name: str
    user_id: int | None = None
    email: str | None = None


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), HASH_ITERATIONS)
    return f"pbkdf2_sha256${HASH_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        algorithm, iterations_text, salt, digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        computed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations_text),
        ).hex()
        return secrets.compare_digest(computed, digest)
    except (ValueError, TypeError):
        return False


def login_admin(settings: Settings, username: str, password: str) -> SessionIdentity:
    if username != settings.erp_admin_username or password != settings.erp_admin_password:
        raise PermissionError("Invalid admin credentials")
    return SessionIdentity(role="admin", name="Admin", email=username)


def login_employee(db: Session, email: str, password: str) -> SessionIdentity:
    user = db.query(ERPUser).filter(ERPUser.email == email).one_or_none()
    if user is None or user.role == "admin" or not verify_password(password, user.password_hash):
        raise PermissionError("Invalid user credentials")
    user.status = "online"
    user.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return SessionIdentity(role="user", name=user.name, user_id=user.id, email=user.email)


def request_account(db: Session, name: str, email: str, password: str, phone: str | None = None) -> ERPAccountRequest:
    cleaned_name = " ".join(name.strip().split())
    cleaned_email = email.strip().lower()
    if len(cleaned_name) < 2:
        raise ValueError("Name must be at least 2 characters")
    if "@" not in cleaned_email:
        raise ValueError("Valid email is required")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if db.query(ERPUser).filter(ERPUser.email == cleaned_email).first() is not None:
        raise ValueError("An approved user with this email already exists")
    existing_pending = (
        db.query(ERPAccountRequest)
        .filter(ERPAccountRequest.email == cleaned_email, ERPAccountRequest.status == "pending")
        .first()
    )
    if existing_pending is not None:
        raise ValueError("A pending account request already exists for this email")

    account_request = ERPAccountRequest(
        name=cleaned_name,
        email=cleaned_email,
        phone=phone,
        password_hash=hash_password(password),
        status="pending",
        requested_role="employee",
    )
    db.add(account_request)
    db.commit()
    db.refresh(account_request)
    return account_request


def _normalized_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def approve_account_request(db: Session, request_id: int, decided_by: str = "admin") -> ERPUser:
    account_request = db.get(ERPAccountRequest, request_id)
    if account_request is None:
        raise LookupError("Account request not found")
    if account_request.status != "pending":
        raise ValueError("Account request is already decided")
    if db.query(ERPUser).filter(ERPUser.email == account_request.email).first() is not None:
        raise ValueError("An approved user with this email already exists")

    now = datetime.now(timezone.utc)
    normalized_request_name = _normalized_name(account_request.name)
    legacy_user = next(
        (
            user
            for user in db.query(ERPUser).all()
            if _normalized_name(user.name) == normalized_request_name
            and user.approved_at is None
            and user.password_hash is None
        ),
        None,
    )
    if legacy_user is None:
        user = ERPUser(
            name=account_request.name,
            role=account_request.requested_role,
            status="offline",
            email=account_request.email,
            phone=account_request.phone,
            password_hash=account_request.password_hash,
            approved_at=now,
        )
        db.add(user)
        db.flush()
    else:
        user = legacy_user
        user.name = account_request.name
        user.role = account_request.requested_role
        user.email = account_request.email
        user.phone = account_request.phone
        user.password_hash = account_request.password_hash
        user.approved_at = now

    account_request.status = "approved"
    account_request.decided_by = decided_by
    account_request.decided_at = now
    account_request.created_user_id = user.id
    db.commit()
    db.refresh(user)
    return user


def reject_account_request(db: Session, request_id: int, decided_by: str = "admin") -> ERPAccountRequest:
    account_request = db.get(ERPAccountRequest, request_id)
    if account_request is None:
        raise LookupError("Account request not found")
    if account_request.status != "pending":
        raise ValueError("Account request is already decided")
    account_request.status = "rejected"
    account_request.decided_by = decided_by
    account_request.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(account_request)
    return account_request
