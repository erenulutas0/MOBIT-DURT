from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import ERPNotification, ERPTaskAssignment, ERPUser


def _client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app), TestingSessionLocal
    finally:
        app.dependency_overrides.clear()


def test_erp_overview_starts_empty_without_demo_seed():
    for client, _ in _client():
        response = client.get("/erp/overview")

        assert response.status_code == 200
        payload = response.json()
        assert payload["users"] == []
        assert payload["tasks"] == []


def test_erp_user_and_task_flow_creates_assignment_and_notification():
    for client, SessionLocal in _client():
        user_response = client.post(
            "/erp/users",
            json={"name": "Murat Kaya", "role": "employee", "status": "offline", "email": "murat@example.local"},
        )
        assert user_response.status_code == 200
        user_id = user_response.json()["id"]

        task_response = client.post(
            "/erp/tasks",
            json={
                "title": "Teklif cetvelini kontrol et",
                "description": "Birim fiyatlari gozden gecir.",
                "assignee_user_ids": [user_id],
                "priority": "high",
            },
        )
        assert task_response.status_code == 200
        task_id = task_response.json()["id"]

        with SessionLocal() as db:
            assignment = db.query(ERPTaskAssignment).one()
            notification = db.query(ERPNotification).one()
            assert assignment.task_id == task_id
            assert assignment.assignee_user_id == user_id
            assert notification.user_id == user_id

        patch_response = client.patch(f"/erp/tasks/{task_id}", json={"status": "done"})
        assert patch_response.status_code == 200
        assert patch_response.json()["status"] == "done"


def test_erp_task_endpoint_rejects_unknown_priority():
    for client, _ in _client():
        response = client.post(
            "/erp/tasks",
            json={"title": "Gecersiz oncelik", "priority": "impossible"},
        )

        assert response.status_code == 400


def test_delete_user_endpoint_removes_user_and_assignments():
    for client, SessionLocal in _client():
        user_response = client.post(
            "/erp/users",
            json={"name": "Silinecek Kisi", "role": "employee", "status": "offline", "email": "delete@example.local"},
        )
        assert user_response.status_code == 200
        user_id = user_response.json()["id"]
        task_response = client.post(
            "/erp/tasks",
            json={"title": "Silme endpoint gorevi", "assignee_user_ids": [user_id]},
        )
        assert task_response.status_code == 200

        delete_response = client.delete(f"/erp/users/{user_id}")

        assert delete_response.status_code == 204
        with SessionLocal() as db:
            assert db.get(ERPUser, user_id) is None
            assert db.query(ERPTaskAssignment).filter(ERPTaskAssignment.assignee_user_id == user_id).count() == 0
            assert db.query(ERPNotification).filter(ERPNotification.user_id == user_id).count() == 0


def test_presence_endpoint_updates_user_status():
    for client, SessionLocal in _client():
        user_response = client.post(
            "/erp/users",
            json={"name": "Online Kullanici", "role": "employee", "status": "offline", "email": "online@example.local"},
        )
        user_id = user_response.json()["id"]

        response = client.post(f"/erp/users/{user_id}/presence", json={"status": "online"})

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "online"
        assert payload["last_seen_at"] is not None
        with SessionLocal() as db:
            assert db.get(ERPUser, user_id).status == "online"


def test_presence_endpoint_rejects_unknown_status():
    for client, _ in _client():
        user_response = client.post(
            "/erp/users",
            json={"name": "Hatali Status", "role": "employee", "status": "offline", "email": "bad-status@example.local"},
        )
        user_id = user_response.json()["id"]

        response = client.post(f"/erp/users/{user_id}/presence", json={"status": "busy"})

        assert response.status_code == 400


def test_account_request_approval_and_employee_login_flow():
    for client, _ in _client():
        request_response = client.post(
            "/erp/account-requests",
            json={"name": "Can Yilmaz", "email": "can@example.local", "password": "secret123"},
        )
        assert request_response.status_code == 200
        request_id = request_response.json()["id"]

        denied_login = client.post(
            "/erp/auth/login",
            json={"email": "can@example.local", "password": "secret123"},
        )
        assert denied_login.status_code == 401

        pending_response = client.get("/erp/account-requests")
        assert pending_response.status_code == 200
        assert len(pending_response.json()) == 1

        approve_response = client.post(f"/erp/account-requests/{request_id}/approve")
        assert approve_response.status_code == 200

        login_response = client.post(
            "/erp/auth/login",
            json={"email": "can@example.local", "password": "secret123"},
        )
        assert login_response.status_code == 200
        payload = login_response.json()
        assert payload["role"] == "user"
        assert payload["user_id"] == approve_response.json()["id"]


def test_task_completion_request_and_admin_approval_api_flow():
    for client, _ in _client():
        user_response = client.post("/erp/users", json={"name": "Eren", "email": "eren.api@example.local"})
        user_id = user_response.json()["id"]
        task_response = client.post(
            "/erp/tasks",
            json={"title": "ERP modulu", "assignee_user_ids": [user_id]},
        )
        task_id = task_response.json()["id"]

        request_response = client.post(
            f"/erp/tasks/{task_id}/completion-request",
            json={"user_id": user_id, "note": "Bitti."},
        )
        assert request_response.status_code == 200
        assert request_response.json()["status"] == "pending_approval"

        notifications_response = client.get("/erp/notifications?user_id=0")
        assert notifications_response.status_code == 200
        assert notifications_response.json()[0]["type"] == "task_completion_requested"

        approve_response = client.post(
            f"/erp/tasks/{task_id}/approve-completion",
            json={"admin_name": "admin"},
        )
        assert approve_response.status_code == 200
        assert approve_response.json()["status"] == "done"


def test_completion_request_api_rejects_unassigned_employee():
    for client, _ in _client():
        user_response = client.post("/erp/users", json={"name": "Eren", "email": "eren.unassigned.completion@example.local"})
        user_id = user_response.json()["id"]
        task_response = client.post("/erp/tasks", json={"title": "Atanmamis tamamlama gorevi"})
        task_id = task_response.json()["id"]

        response = client.post(
            f"/erp/tasks/{task_id}/completion-request",
            json={"user_id": user_id, "note": "Ben bitirdim."},
        )

        assert response.status_code == 400
        assert "not assigned" in response.json()["detail"]


def test_notification_read_endpoint_marks_notification_read():
    for client, SessionLocal in _client():
        with SessionLocal() as db:
            notification = ERPNotification(user_id=7, type="manager_message", title="Mesaj", body="Test")
            db.add(notification)
            db.commit()
            db.refresh(notification)
            notification_id = notification.id

        response = client.patch(f"/erp/notifications/{notification_id}/read")

        assert response.status_code == 200
        payload = response.json()
        assert payload["id"] == notification_id
        assert payload["read_at"] is not None


def test_task_comment_api_creates_help_message():
    for client, _ in _client():
        task_response = client.post("/erp/tasks", json={"title": "Mesajli gorev"})
        task_id = task_response.json()["id"]

        response = client.post(
            f"/erp/tasks/{task_id}/comments",
            json={"author_user_id": None, "body": "Kontrol bekliyorum.", "kind": "reply"},
        )

        assert response.status_code == 200
        assert response.json()["body"] == "Kontrol bekliyorum."


def test_task_comment_api_rejects_unassigned_employee_message():
    for client, _ in _client():
        user_response = client.post("/erp/users", json={"name": "Eren", "email": "eren.unassigned@example.local"})
        user_id = user_response.json()["id"]
        task_response = client.post("/erp/tasks", json={"title": "Baskasinin mesaj gorevi"})
        task_id = task_response.json()["id"]

        response = client.post(
            f"/erp/tasks/{task_id}/comments",
            json={"author_user_id": user_id, "body": "Bu goreve yazamam.", "kind": "help"},
        )

        assert response.status_code == 400
        assert "not assigned" in response.json()["detail"]
