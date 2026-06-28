from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    ERPAccountRequest,
    ERPNotification,
    ERPTask,
    ERPTaskAssignment,
    ERPTaskComment,
    ERPTaskDocument,
    ERPTeam,
    ERPTeamMember,
    ERPUser,
)


VALID_TASK_STATUSES = {"todo", "in_progress", "blocked", "pending_approval", "done", "overdue", "cancelled"}
VALID_PRIORITIES = {"low", "normal", "high", "urgent"}
VALID_USER_STATUSES = {"online", "offline", "away"}
VALID_USER_ROLES = {"admin", "owner", "manager", "employee"}
ONLINE_STALE_AFTER = timedelta(seconds=45)


@dataclass(frozen=True)
class ERPOverview:
    users: list[ERPUser]
    tasks: list[ERPTask]
    assignments: list[ERPTaskAssignment]
    documents: list[ERPTaskDocument]
    help_messages: list[ERPTaskComment]
    notifications: list[ERPNotification]


def seed_erp_demo_data(db: Session) -> None:
    if db.query(ERPUser).count() > 0:
        return

    now = datetime.now(timezone.utc)
    users = [
        ERPUser(name="Eren Ulutas", role="owner", status="online", email="eren@example.local", last_seen_at=now),
        ERPUser(name="Murat Kaya", role="employee", status="online", email="murat@example.local", last_seen_at=now - timedelta(minutes=4)),
        ERPUser(name="Ayse Demir", role="employee", status="away", email="ayse@example.local", last_seen_at=now - timedelta(minutes=28)),
        ERPUser(name="Can Yilmaz", role="employee", status="offline", email="can@example.local", last_seen_at=now - timedelta(hours=2)),
    ]
    db.add_all(users)
    db.flush()

    teams = [
        ERPTeam(name="MOBIT Teknik"),
        ERPTeam(name="Satinalma"),
        ERPTeam(name="Operasyon"),
    ]
    db.add_all(teams)
    db.flush()

    db.add_all(
        [
            ERPTeamMember(team_id=teams[0].id, user_id=users[3].id),
            ERPTeamMember(team_id=teams[1].id, user_id=users[1].id),
            ERPTeamMember(team_id=teams[2].id, user_id=users[2].id),
        ]
    )

    tasks = [
        ERPTask(
            title="BEDAS 2026 ihalesi teknik sartname kontrolu",
            description="Teknik sartname icindeki kritik maddeleri ve riskleri isaretle.",
            assigned_by_user_id=users[0].id,
            status="in_progress",
            priority="high",
            deadline_at=now + timedelta(hours=5),
        ),
        ERPTask(
            title="Akumulator kalemi icin 3 tedarikciden fiyat al",
            description="Gelen ihale dokumanindaki akumulator kalemi icin fiyat teklifi topla.",
            assigned_by_user_id=users[0].id,
            status="overdue",
            priority="urgent",
            deadline_at=now - timedelta(days=1),
        ),
        ERPTask(
            title="IGDAS evrak teslim checklist hazirla",
            description="Evrak listesindeki eksikleri kontrol edip yoneticiye bildir.",
            assigned_by_user_id=users[0].id,
            status="todo",
            priority="normal",
            deadline_at=None,
        ),
    ]
    db.add_all(tasks)
    db.flush()

    db.add_all(
        [
            ERPTaskAssignment(task_id=tasks[0].id, assignee_user_id=users[3].id),
            ERPTaskAssignment(task_id=tasks[0].id, assignee_team_id=teams[0].id),
            ERPTaskAssignment(task_id=tasks[1].id, assignee_user_id=users[1].id),
            ERPTaskAssignment(task_id=tasks[2].id, assignee_user_id=users[2].id),
        ]
    )
    db.add_all(
        [
            ERPTaskDocument(task_id=tasks[0].id, original_filename="teknik-sartname.pdf"),
            ERPTaskDocument(task_id=tasks[1].id, original_filename="akumulator-kalemleri.xlsx"),
            ERPTaskDocument(task_id=tasks[2].id, original_filename="evrak-checklist.docx"),
        ]
    )
    db.add_all(
        [
            ERPTaskComment(task_id=tasks[2].id, author_user_id=users[2].id, body="Teminat mektubu icin son format hangisi?", kind="help"),
            ERPTaskComment(task_id=tasks[0].id, author_user_id=users[3].id, body="Teknik sartname PDF'inde bir madde belirsiz, kontrol gerekir.", kind="help"),
        ]
    )
    db.add_all(
        [
            ERPNotification(
                user_id=users[1].id,
                type="task_overdue",
                title="Goreviniz gecikti",
                body="Akumulator kalemi icin fiyat alma gorevi deadline'i asti.",
            ),
            ERPNotification(
                user_id=users[0].id,
                type="manager_overdue_digest",
                title="2 calisan geciken goreve sahip",
                body="Murat Kaya ve Ayse Demir icin takip gerekiyor.",
            ),
        ]
    )
    db.commit()


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def refresh_stale_presence(db: Session, now: datetime | None = None) -> None:
    current_time = now or datetime.now(timezone.utc)
    changed = False
    for user in db.query(ERPUser).filter(ERPUser.status.in_(["online", "away"])).all():
        last_seen_at = _aware(user.last_seen_at)
        if last_seen_at is None or current_time - last_seen_at > ONLINE_STALE_AFTER:
            user.status = "offline"
            changed = True
    if changed:
        db.commit()


def get_overview(db: Session) -> ERPOverview:
    refresh_stale_presence(db)
    return ERPOverview(
        users=db.query(ERPUser).order_by(ERPUser.name).all(),
        tasks=db.query(ERPTask).order_by(ERPTask.created_at.desc(), ERPTask.id.desc()).all(),
        assignments=db.query(ERPTaskAssignment).all(),
        documents=db.query(ERPTaskDocument).all(),
        help_messages=(
            db.query(ERPTaskComment)
            .filter(ERPTaskComment.kind.in_(["help", "message", "reply", "completion_request", "completion_approved", "completion_rejected"]))
            .order_by(ERPTaskComment.created_at.desc(), ERPTaskComment.id.desc())
            .limit(10)
            .all()
        ),
        notifications=(
            db.query(ERPNotification)
            .order_by(ERPNotification.created_at.desc(), ERPNotification.id.desc())
            .limit(20)
            .all()
        ),
    )


def create_user(
    db: Session,
    name: str,
    role: str = "employee",
    status: str = "offline",
    email: str | None = None,
    phone: str | None = None,
    password_hash: str | None = None,
) -> ERPUser:
    cleaned_name = " ".join(name.strip().split())
    if len(cleaned_name) < 2:
        raise ValueError("User name must be at least 2 characters")
    if role not in VALID_USER_ROLES:
        raise ValueError("Unknown user role")
    if status not in VALID_USER_STATUSES:
        raise ValueError("Unknown user status")
    if email and db.query(ERPUser).filter(ERPUser.email == email).first() is not None:
        raise ValueError("Email already exists")

    user = ERPUser(
        name=cleaned_name,
        role=role,
        status=status,
        email=email,
        phone=phone,
        password_hash=password_hash,
        approved_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user_presence(db: Session, user_id: int, status: str) -> ERPUser:
    if status not in VALID_USER_STATUSES:
        raise ValueError("Unknown user status")
    user = db.get(ERPUser, user_id)
    if user is None:
        raise LookupError("User not found")
    user.status = status
    user.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> ERPUser:
    user = db.get(ERPUser, user_id)
    if user is None:
        raise LookupError("User not found")
    deleted_user = ERPUser(
        id=user.id,
        name=user.name,
        role=user.role,
        status=user.status,
        email=user.email,
        phone=user.phone,
        password_hash=user.password_hash,
        approved_at=user.approved_at,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
    )

    db.query(ERPTaskAssignment).filter(ERPTaskAssignment.assignee_user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(ERPTeamMember).filter(ERPTeamMember.user_id == user.id).delete(synchronize_session=False)
    db.query(ERPNotification).filter(ERPNotification.user_id == user.id).delete(synchronize_session=False)
    db.query(ERPTaskComment).filter(ERPTaskComment.author_user_id == user.id).update(
        {ERPTaskComment.author_user_id: None},
        synchronize_session=False,
    )
    db.query(ERPTask).filter(ERPTask.assigned_by_user_id == user.id).update(
        {ERPTask.assigned_by_user_id: None},
        synchronize_session=False,
    )
    db.query(ERPAccountRequest).filter(ERPAccountRequest.created_user_id == user.id).update(
        {ERPAccountRequest.created_user_id: None},
        synchronize_session=False,
    )
    db.delete(user)
    db.commit()
    return deleted_user


def create_task(
    db: Session,
    title: str,
    description: str | None,
    assigned_by_user_id: int | None,
    assignee_user_ids: list[int],
    assignee_team_ids: list[int],
    priority: str = "normal",
    deadline_at: datetime | None = None,
) -> ERPTask:
    if priority not in VALID_PRIORITIES:
        raise ValueError("Unknown priority")
    cleaned_title = " ".join(title.strip().split())
    if len(cleaned_title) < 3:
        raise ValueError("Task title must be at least 3 characters")

    task = ERPTask(
        title=cleaned_title,
        description=description,
        assigned_by_user_id=assigned_by_user_id,
        priority=priority,
        status="todo",
        deadline_at=deadline_at,
    )
    db.add(task)
    db.flush()
    for user_id in assignee_user_ids:
        db.add(ERPTaskAssignment(task_id=task.id, assignee_user_id=user_id))
        db.add(
            ERPNotification(
                user_id=user_id,
                type="task_assigned",
                title="Yeni gorev atandi",
                body=task.title,
            )
        )
    for team_id in assignee_team_ids:
        db.add(ERPTaskAssignment(task_id=task.id, assignee_team_id=team_id))
    db.commit()
    db.refresh(task)
    return task


def update_task_status(db: Session, task_id: int, status: str) -> ERPTask:
    if status not in VALID_TASK_STATUSES:
        raise ValueError("Unknown task status")
    task = db.get(ERPTask, task_id)
    if task is None:
        raise LookupError("Task not found")
    task.status = status
    if status == "done":
        task.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return task


def request_task_completion(db: Session, task_id: int, user_id: int | None, note: str | None = None) -> ERPTask:
    task = db.get(ERPTask, task_id)
    if task is None:
        raise LookupError("Task not found")
    if task.status in {"done", "cancelled"}:
        raise ValueError("Task is already closed")
    if user_id is not None:
        author = db.get(ERPUser, user_id)
        if author is None:
            raise ValueError("User not found")
        assignment = (
            db.query(ERPTaskAssignment)
            .filter(
                ERPTaskAssignment.task_id == task.id,
                ERPTaskAssignment.assignee_user_id == user_id,
            )
            .first()
        )
        if assignment is None:
            raise ValueError("User is not assigned to this task")

    task.status = "pending_approval"
    db.add(
        ERPTaskComment(
            task_id=task.id,
            author_user_id=user_id,
            body=note or "Calisan gorevi bitirdigini bildirdi. Admin onayi bekleniyor.",
            kind="completion_request",
        )
    )
    db.add(
        ERPNotification(
            user_id=0,
            type="task_completion_requested",
            title="Gorev tamamlama onayi bekliyor",
            body=task.title,
        )
    )
    db.commit()
    db.refresh(task)
    return task


def approve_task_completion(db: Session, task_id: int, admin_name: str = "admin") -> ERPTask:
    task = db.get(ERPTask, task_id)
    if task is None:
        raise LookupError("Task not found")
    if task.status != "pending_approval":
        raise ValueError("Task is not waiting for completion approval")

    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)
    db.add(
        ERPTaskComment(
            task_id=task.id,
            author_user_id=None,
            body=f"{admin_name} gorevin basariyla bittigini onayladi.",
            kind="completion_approved",
        )
    )
    for assignment in db.query(ERPTaskAssignment).filter(ERPTaskAssignment.task_id == task.id).all():
        if assignment.assignee_user_id:
            db.add(
                ERPNotification(
                    user_id=assignment.assignee_user_id,
                    type="task_completion_approved",
                    title="Goreviniz onaylandi",
                    body=task.title,
                )
            )
    db.commit()
    db.refresh(task)
    return task


def reject_task_completion(db: Session, task_id: int, admin_name: str = "admin", note: str | None = None) -> ERPTask:
    task = db.get(ERPTask, task_id)
    if task is None:
        raise LookupError("Task not found")
    if task.status != "pending_approval":
        raise ValueError("Task is not waiting for completion approval")

    task.status = "in_progress"
    db.add(
        ERPTaskComment(
            task_id=task.id,
            author_user_id=None,
            body=note or f"{admin_name} gorevi tekrar calismaya gonderdi.",
            kind="completion_rejected",
        )
    )
    for assignment in db.query(ERPTaskAssignment).filter(ERPTaskAssignment.task_id == task.id).all():
        if assignment.assignee_user_id:
            db.add(
                ERPNotification(
                    user_id=assignment.assignee_user_id,
                    type="task_completion_rejected",
                    title="Gorev tekrar calismaya gonderildi",
                    body=task.title,
                )
            )
    db.commit()
    db.refresh(task)
    return task


def create_task_comment(
    db: Session,
    task_id: int,
    body: str,
    author_user_id: int | None = None,
    kind: str = "message",
) -> ERPTaskComment:
    task = db.get(ERPTask, task_id)
    if task is None:
        raise LookupError("Task not found")
    cleaned_body = body.strip()
    if len(cleaned_body) < 2:
        raise ValueError("Message must be at least 2 characters")
    if kind not in {"help", "message", "reply"}:
        raise ValueError("Unknown message kind")
    if author_user_id is not None:
        author = db.get(ERPUser, author_user_id)
        if author is None:
            raise ValueError("User not found")
        assignment = (
            db.query(ERPTaskAssignment)
            .filter(
                ERPTaskAssignment.task_id == task.id,
                ERPTaskAssignment.assignee_user_id == author_user_id,
            )
            .first()
        )
        if assignment is None:
            raise ValueError("User is not assigned to this task")

    comment = ERPTaskComment(task_id=task.id, author_user_id=author_user_id, body=cleaned_body, kind=kind)
    db.add(comment)
    if author_user_id is None:
        for assignment in db.query(ERPTaskAssignment).filter(ERPTaskAssignment.task_id == task.id).all():
            if assignment.assignee_user_id:
                db.add(
                    ERPNotification(
                        user_id=assignment.assignee_user_id,
                        type="manager_message",
                        title="Yonetici mesaj gonderdi",
                        body=task.title,
                    )
                )
    else:
        db.add(
            ERPNotification(
                user_id=0,
                type="employee_help_message",
                title="Calisan yardim mesaji gonderdi",
                body=task.title,
            )
        )
    db.commit()
    db.refresh(comment)
    return comment


def list_notifications(db: Session, user_id: int | None = None) -> list[ERPNotification]:
    query = db.query(ERPNotification)
    if user_id is not None:
        query = query.filter(ERPNotification.user_id == user_id)
    return query.order_by(ERPNotification.created_at.desc(), ERPNotification.id.desc()).limit(50).all()


def mark_notification_read(db: Session, notification_id: int) -> ERPNotification:
    notification = db.get(ERPNotification, notification_id)
    if notification is None:
        raise LookupError("Notification not found")
    notification.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(notification)
    return notification
