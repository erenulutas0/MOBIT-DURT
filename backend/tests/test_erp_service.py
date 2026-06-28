from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.erp.service import (
    approve_task_completion,
    create_task,
    create_task_comment,
    create_user,
    delete_user,
    refresh_stale_presence,
    reject_task_completion,
    request_task_completion,
    seed_erp_demo_data,
    update_task_status,
    update_user_presence,
)
from app.models import ERPNotification, ERPTask, ERPTaskAssignment, ERPTaskComment, ERPTeamMember, ERPUser


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_seed_erp_demo_data_is_idempotent():
    with _session() as db:
        seed_erp_demo_data(db)
        seed_erp_demo_data(db)

        assert db.query(ERPUser).count() == 4
        assert db.query(ERPTask).count() == 3


def test_create_task_assigns_user_and_notifies_them():
    with _session() as db:
        user = ERPUser(name="Murat Kaya", role="employee", status="online")
        db.add(user)
        db.commit()
        db.refresh(user)

        task = create_task(
            db,
            title="Teklif cetvelini kontrol et",
            description="Birim fiyatlari gozden gecir.",
            assigned_by_user_id=None,
            assignee_user_ids=[user.id],
            assignee_team_ids=[],
            priority="high",
        )

        assignment = db.query(ERPTaskAssignment).one()
        notification = db.query(ERPNotification).one()

        assert task.status == "todo"
        assert task.priority == "high"
        assert assignment.assignee_user_id == user.id
        assert notification.type == "task_assigned"


def test_create_user_validates_duplicate_email():
    with _session() as db:
        create_user(db, name="Ayse Demir", email="ayse@example.local")

        try:
            create_user(db, name="Ayse Demir 2", email="ayse@example.local")
        except ValueError as exc:
            assert "Email already exists" in str(exc)
        else:
            raise AssertionError("duplicate email should fail")


def test_update_user_presence_sets_status_and_last_seen():
    with _session() as db:
        user = ERPUser(name="Kursat", role="employee", status="offline")
        db.add(user)
        db.commit()
        db.refresh(user)

        updated = update_user_presence(db, user.id, "online")

        assert updated.status == "online"
        assert updated.last_seen_at is not None


def test_refresh_stale_presence_marks_old_online_users_offline():
    now = datetime.now(timezone.utc)
    with _session() as db:
        active = ERPUser(name="Aktif", role="employee", status="online", last_seen_at=now - timedelta(seconds=10))
        stale = ERPUser(name="Eski", role="employee", status="online", last_seen_at=now - timedelta(minutes=2))
        db.add_all([active, stale])
        db.commit()

        refresh_stale_presence(db, now=now)
        db.refresh(active)
        db.refresh(stale)

        assert active.status == "online"
        assert stale.status == "offline"


def test_delete_user_removes_active_links_but_preserves_task_and_comment_history():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="offline", email="eren@example.local")
        task = ERPTask(title="Silme testi", assigned_by_user_id=None)
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)
        db.add_all(
            [
                ERPTaskAssignment(task_id=task.id, assignee_user_id=user.id),
                ERPTaskComment(task_id=task.id, author_user_id=user.id, body="Eski yorum", kind="help"),
                ERPNotification(user_id=user.id, type="manager_message", title="Mesaj", body=task.title),
                ERPTeamMember(team_id=1, user_id=user.id),
            ]
        )
        db.commit()

        deleted = delete_user(db, user.id)

        assert deleted.id == user.id
        assert db.get(ERPUser, user.id) is None
        assert db.query(ERPTask).count() == 1
        assert db.query(ERPTaskAssignment).count() == 0
        assert db.query(ERPNotification).count() == 0
        assert db.query(ERPTeamMember).count() == 0
        assert db.query(ERPTaskComment).one().author_user_id is None


def test_update_task_status_marks_done_with_completed_at():
    with _session() as db:
        task = ERPTask(title="Dokumanlari arsivle")
        db.add(task)
        db.commit()
        db.refresh(task)

        updated = update_task_status(db, task.id, "done")

        assert updated.status == "done"
        assert updated.completed_at is not None


def test_task_completion_requires_admin_approval():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="online")
        task = ERPTask(title="ERP yazilimi bitecek", status="in_progress")
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)
        db.add(ERPTaskAssignment(task_id=task.id, assignee_user_id=user.id))
        db.commit()

        requested = request_task_completion(db, task.id, user.id, "Bitti, kontrol edebilirsiniz.")
        assert requested.status == "pending_approval"
        assert db.query(ERPTaskComment).filter(ERPTaskComment.kind == "completion_request").count() == 1
        assert db.query(ERPNotification).filter(ERPNotification.user_id == 0).count() == 1

        approved = approve_task_completion(db, task.id)
        assert approved.status == "done"
        assert approved.completed_at is not None
        assert db.query(ERPNotification).filter(ERPNotification.user_id == user.id).count() == 1


def test_task_completion_can_be_rejected_back_to_in_progress():
    with _session() as db:
        task = ERPTask(title="Teklifleri topla", status="in_progress")
        db.add(task)
        db.commit()
        db.refresh(task)

        request_task_completion(db, task.id, None)
        rejected = reject_task_completion(db, task.id, note="Eksik belge var.")

        assert rejected.status == "in_progress"
        assert db.query(ERPTaskComment).filter(ERPTaskComment.kind == "completion_rejected").one().body == "Eksik belge var."


def test_create_task_comment_notifies_manager_for_employee_message():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="online")
        task = ERPTask(title="Yardim isteyen gorev")
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)
        db.add(ERPTaskAssignment(task_id=task.id, assignee_user_id=user.id))
        db.commit()

        comment = create_task_comment(db, task.id, "Yardim gerekir.", author_user_id=user.id, kind="help")

        assert comment.kind == "help"
        notification = db.query(ERPNotification).one()
        assert notification.user_id == 0
        assert notification.type == "employee_help_message"


def test_employee_comment_requires_task_assignment():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="online")
        task = ERPTask(title="Baskasinin gorevi")
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)

        try:
            create_task_comment(db, task.id, "Bu gorev bana ait degil.", author_user_id=user.id, kind="help")
        except ValueError as exc:
            assert "not assigned" in str(exc)
        else:
            raise AssertionError("unassigned employee should not be able to comment")


def test_completion_request_requires_task_assignment():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="online")
        task = ERPTask(title="Baskasinin bitirme istegi", status="in_progress")
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)

        try:
            request_task_completion(db, task.id, user.id, "Bitti.")
        except ValueError as exc:
            assert "not assigned" in str(exc)
        else:
            raise AssertionError("unassigned employee should not be able to request completion")


def test_manager_message_notifies_assigned_employee():
    with _session() as db:
        user = ERPUser(name="Eren", role="employee", status="online")
        task = ERPTask(title="Admin mesaj gorevi")
        db.add_all([user, task])
        db.commit()
        db.refresh(user)
        db.refresh(task)
        db.add(ERPTaskAssignment(task_id=task.id, assignee_user_id=user.id))
        db.commit()

        comment = create_task_comment(db, task.id, "Admin mesaji.", author_user_id=None, kind="reply")

        assert comment.kind == "reply"
        notification = db.query(ERPNotification).one()
        assert notification.user_id == user.id
        assert notification.type == "manager_message"
