from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.erp.auth import (
    approve_account_request,
    login_admin,
    login_employee,
    reject_account_request,
    request_account,
)
from app.erp.service import (
    approve_task_completion,
    create_task,
    create_task_comment,
    create_user,
    delete_user,
    get_overview,
    list_notifications,
    mark_notification_read,
    reject_task_completion,
    request_task_completion,
    update_task_status,
    update_user_presence,
)
from app.models import (
    ERPAccountRequest,
    ERPNotification,
    ERPTask,
    ERPTaskAssignment,
    ERPTaskComment,
    ERPTaskDocument,
    ERPTeam,
    ERPUser,
)


router = APIRouter(prefix="/erp", tags=["erp"])


class ERPUserOut(BaseModel):
    id: int
    name: str
    role: str
    status: str
    email: str | None
    phone: str | None
    last_seen_at: datetime | None
    approved_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPTeamOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPTaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    assigned_by_user_id: int | None
    status: str
    priority: str
    deadline_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPTaskAssignmentOut(BaseModel):
    id: int
    task_id: int
    assignee_user_id: int | None
    assignee_team_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPTaskDocumentOut(BaseModel):
    id: int
    task_id: int
    document_id: int | None
    original_filename: str | None
    file_path: str | None
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPTaskCommentOut(BaseModel):
    id: int
    task_id: int
    author_user_id: int | None
    body: str
    kind: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPNotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    body: str | None
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPAccountRequestOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None
    status: str
    requested_role: str
    decided_by: str | None
    decided_at: datetime | None
    created_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ERPSessionOut(BaseModel):
    role: str
    name: str
    user_id: int | None = None
    email: str | None = None


class ERPOverviewOut(BaseModel):
    users: list[ERPUserOut]
    teams: list[ERPTeamOut]
    tasks: list[ERPTaskOut]
    assignments: list[ERPTaskAssignmentOut]
    documents: list[ERPTaskDocumentOut]
    help_messages: list[ERPTaskCommentOut]
    notifications: list[ERPNotificationOut]


class ERPTaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = None
    assigned_by_user_id: int | None = None
    assignee_user_ids: list[int] = Field(default_factory=list)
    assignee_team_ids: list[int] = Field(default_factory=list)
    priority: str = "normal"
    deadline_at: datetime | None = None


class ERPUserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    role: str = "employee"
    status: str = "offline"
    email: str | None = None
    phone: str | None = None


class ERPPresenceUpdate(BaseModel):
    status: str


class ERPLoginRequest(BaseModel):
    email: str
    password: str


class ERPAdminLoginRequest(BaseModel):
    username: str
    password: str


class ERPAccountRequestCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    phone: str | None = None


class ERPTaskStatusUpdate(BaseModel):
    status: str


class ERPTaskCompletionRequest(BaseModel):
    user_id: int | None = None
    note: str | None = None


class ERPTaskCompletionDecision(BaseModel):
    admin_name: str = "admin"
    note: str | None = None


class ERPTaskCommentCreate(BaseModel):
    author_user_id: int | None = None
    body: str = Field(min_length=2, max_length=4000)
    kind: str = "message"


@router.post("/auth/admin-login", response_model=ERPSessionOut)
def admin_login(payload: ERPAdminLoginRequest, settings: Settings = Depends(get_settings)) -> ERPSessionOut:
    try:
        identity = login_admin(settings, payload.username, payload.password)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return ERPSessionOut(**identity.__dict__)


@router.post("/auth/login", response_model=ERPSessionOut)
def employee_login(payload: ERPLoginRequest, db: Session = Depends(get_db)) -> ERPSessionOut:
    try:
        identity = login_employee(db, payload.email.strip().lower(), payload.password)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return ERPSessionOut(**identity.__dict__)


@router.post("/account-requests", response_model=ERPAccountRequestOut)
def create_account_request(payload: ERPAccountRequestCreate, db: Session = Depends(get_db)) -> ERPAccountRequest:
    try:
        return request_account(
            db,
            name=payload.name,
            email=payload.email,
            password=payload.password,
            phone=payload.phone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/account-requests", response_model=list[ERPAccountRequestOut])
def list_account_requests(status: str = "pending", db: Session = Depends(get_db)) -> list[ERPAccountRequest]:
    query = db.query(ERPAccountRequest)
    if status != "all":
        query = query.filter(ERPAccountRequest.status == status)
    return query.order_by(ERPAccountRequest.created_at.desc(), ERPAccountRequest.id.desc()).all()


@router.post("/account-requests/{request_id}/approve", response_model=ERPUserOut)
def approve_request(request_id: int, db: Session = Depends(get_db)) -> ERPUser:
    try:
        return approve_account_request(db, request_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/account-requests/{request_id}/reject", response_model=ERPAccountRequestOut)
def reject_request(request_id: int, db: Session = Depends(get_db)) -> ERPAccountRequest:
    try:
        return reject_account_request(db, request_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/overview", response_model=ERPOverviewOut)
def overview(db: Session = Depends(get_db)) -> dict[str, object]:
    data = get_overview(db)
    teams = db.query(ERPTeam).order_by(ERPTeam.name).all()
    return {
        "users": data.users,
        "teams": teams,
        "tasks": data.tasks,
        "assignments": data.assignments,
        "documents": data.documents,
        "help_messages": data.help_messages,
        "notifications": data.notifications,
    }


@router.get("/users", response_model=list[ERPUserOut])
def list_users(db: Session = Depends(get_db)) -> list[ERPUser]:
    return db.query(ERPUser).order_by(ERPUser.name).all()


@router.post("/users", response_model=ERPUserOut)
def add_user(payload: ERPUserCreate, db: Session = Depends(get_db)) -> ERPUser:
    try:
        return create_user(
            db,
            name=payload.name,
            role=payload.role,
            status=payload.status,
            email=payload.email,
            phone=payload.phone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/users/{user_id}", status_code=204)
def remove_user(user_id: int, db: Session = Depends(get_db)) -> None:
    try:
        delete_user(db, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/users/{user_id}/presence", response_model=ERPUserOut)
def set_user_presence(user_id: int, payload: ERPPresenceUpdate, db: Session = Depends(get_db)) -> ERPUser:
    try:
        return update_user_presence(db, user_id, payload.status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/teams", response_model=list[ERPTeamOut])
def list_teams(db: Session = Depends(get_db)) -> list[ERPTeam]:
    return db.query(ERPTeam).order_by(ERPTeam.name).all()


@router.get("/tasks", response_model=list[ERPTaskOut])
def list_tasks(db: Session = Depends(get_db)) -> list[ERPTask]:
    return db.query(ERPTask).order_by(ERPTask.created_at.desc(), ERPTask.id.desc()).all()


@router.post("/tasks", response_model=ERPTaskOut)
def add_task(payload: ERPTaskCreate, db: Session = Depends(get_db)) -> ERPTask:
    try:
        return create_task(
            db,
            title=payload.title,
            description=payload.description,
            assigned_by_user_id=payload.assigned_by_user_id,
            assignee_user_ids=payload.assignee_user_ids,
            assignee_team_ids=payload.assignee_team_ids,
            priority=payload.priority,
            deadline_at=payload.deadline_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/tasks/{task_id}", response_model=ERPTaskOut)
def patch_task(task_id: int, payload: ERPTaskStatusUpdate, db: Session = Depends(get_db)) -> ERPTask:
    try:
        return update_task_status(db, task_id, payload.status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tasks/{task_id}/completion-request", response_model=ERPTaskOut)
def request_completion(task_id: int, payload: ERPTaskCompletionRequest, db: Session = Depends(get_db)) -> ERPTask:
    try:
        return request_task_completion(db, task_id, payload.user_id, payload.note)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tasks/{task_id}/approve-completion", response_model=ERPTaskOut)
def approve_completion(task_id: int, payload: ERPTaskCompletionDecision, db: Session = Depends(get_db)) -> ERPTask:
    try:
        return approve_task_completion(db, task_id, payload.admin_name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tasks/{task_id}/reject-completion", response_model=ERPTaskOut)
def reject_completion(task_id: int, payload: ERPTaskCompletionDecision, db: Session = Depends(get_db)) -> ERPTask:
    try:
        return reject_task_completion(db, task_id, payload.admin_name, payload.note)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tasks/{task_id}/comments", response_model=ERPTaskCommentOut)
def add_task_comment(task_id: int, payload: ERPTaskCommentCreate, db: Session = Depends(get_db)) -> ERPTaskComment:
    try:
        return create_task_comment(
            db,
            task_id=task_id,
            author_user_id=payload.author_user_id,
            body=payload.body,
            kind=payload.kind,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/notifications", response_model=list[ERPNotificationOut])
def get_notifications(user_id: int | None = None, db: Session = Depends(get_db)) -> list[ERPNotification]:
    return list_notifications(db, user_id)


@router.patch("/notifications/{notification_id}/read", response_model=ERPNotificationOut)
def read_notification(notification_id: int, db: Session = Depends(get_db)) -> ERPNotification:
    try:
        return mark_notification_read(db, notification_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
