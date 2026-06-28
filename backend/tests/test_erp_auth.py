from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.erp.auth import approve_account_request, login_employee, request_account, verify_password
from app.models import ERPAccountRequest, ERPUser


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_account_request_hashes_password_and_approval_creates_user():
    with _session() as db:
        account_request = request_account(
            db,
            name="Eren Ulutas",
            email="eren@example.local",
            password="secret123",
        )

        assert account_request.status == "pending"
        assert account_request.password_hash != "secret123"
        assert verify_password("secret123", account_request.password_hash)

        user = approve_account_request(db, account_request.id)

        assert user.email == "eren@example.local"
        assert user.password_hash == account_request.password_hash
        assert db.query(ERPAccountRequest).one().status == "approved"
        assert db.query(ERPUser).count() == 1


def test_employee_login_requires_approved_account_password():
    with _session() as db:
        account_request = request_account(
            db,
            name="Murat Kaya",
            email="murat@example.local",
            password="secret123",
        )

        try:
            login_employee(db, "murat@example.local", "secret123")
        except PermissionError:
            pass
        else:
            raise AssertionError("pending account should not login")

        user = approve_account_request(db, account_request.id)
        identity = login_employee(db, "murat@example.local", "secret123")

        assert identity.role == "user"
        assert identity.user_id == user.id
        db.refresh(user)
        assert user.status == "online"
        assert user.last_seen_at is not None


def test_account_approval_reuses_legacy_user_with_same_name():
    with _session() as db:
        legacy = ERPUser(name="Eren", role="employee", status="offline", email="old@example.local")
        db.add(legacy)
        db.commit()
        db.refresh(legacy)
        account_request = request_account(
            db,
            name="eren",
            email="eren@example.local",
            password="secret123",
        )

        user = approve_account_request(db, account_request.id)

        assert user.id == legacy.id
        assert user.email == "eren@example.local"
        assert verify_password("secret123", user.password_hash)
        assert user.approved_at is not None
        assert db.query(ERPUser).count() == 1


def test_duplicate_pending_account_request_is_rejected():
    with _session() as db:
        request_account(db, name="Ayse Demir", email="ayse@example.local", password="secret123")

        try:
            request_account(db, name="Ayse Demir", email="ayse@example.local", password="secret123")
        except ValueError as exc:
            assert "pending account request" in str(exc)
        else:
            raise AssertionError("duplicate pending request should fail")
