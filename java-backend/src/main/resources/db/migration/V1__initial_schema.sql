CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    message_id VARCHAR(128) NOT NULL UNIQUE,
    sender_hash VARCHAR(64) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'whatsapp',
    timestamp TIMESTAMPTZ NOT NULL,
    media_id VARCHAR(128) NOT NULL,
    mime_type VARCHAR(255),
    original_filename VARCHAR(255),
    stored_filename VARCHAR(255),
    caption TEXT,
    checksum VARCHAR(64),
    file_path TEXT,
    file_size BIGINT,
    internal_unit VARCHAR(64),
    organization VARCHAR(64),
    year INTEGER,
    tender_id VARCHAR(128) NOT NULL,
    document_type VARCHAR(64) NOT NULL DEFAULT 'unknown',
    status VARCHAR(32) NOT NULL DEFAULT 'received',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_documents_message_id ON documents(message_id);
CREATE INDEX ix_documents_sender_hash ON documents(sender_hash);
CREATE INDEX ix_documents_timestamp ON documents(timestamp);
CREATE INDEX ix_documents_media_id ON documents(media_id);
CREATE INDEX ix_documents_checksum ON documents(checksum);
CREATE INDEX ix_documents_internal_unit ON documents(internal_unit);
CREATE INDEX ix_documents_organization ON documents(organization);
CREATE INDEX ix_documents_year ON documents(year);
CREATE INDEX ix_documents_tender_id ON documents(tender_id);
CREATE INDEX ix_documents_document_type ON documents(document_type);
CREATE INDEX ix_documents_status ON documents(status);

CREATE TABLE tenders (
    id BIGSERIAL PRIMARY KEY,
    tender_id VARCHAR(128) NOT NULL UNIQUE,
    organization VARCHAR(64) NOT NULL,
    year INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    internal_unit VARCHAR(64),
    title VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_tenders_organization ON tenders(organization);
CREATE INDEX ix_tenders_year ON tenders(year);
CREATE INDEX ix_tenders_internal_unit ON tenders(internal_unit);
CREATE INDEX ix_tenders_status ON tenders(status);

CREATE TABLE telegram_chat_bindings (
    id BIGSERIAL PRIMARY KEY,
    chat_id VARCHAR(64) NOT NULL UNIQUE,
    chat_title VARCHAR(255),
    tender_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_telegram_chat_bindings_tender_id ON telegram_chat_bindings(tender_id);

CREATE TABLE telegram_chat_setups (
    id BIGSERIAL PRIMARY KEY,
    chat_id VARCHAR(64) NOT NULL UNIQUE,
    chat_title VARCHAR(255),
    internal_unit VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_telegram_chat_setups_internal_unit ON telegram_chat_setups(internal_unit);

CREATE TABLE tender_organizations (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_tender_organizations_active ON tender_organizations(active);

CREATE TABLE erp_users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'employee',
    status VARCHAR(32) NOT NULL DEFAULT 'offline',
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(64),
    password_hash VARCHAR(255),
    approved_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_users_name ON erp_users(name);
CREATE INDEX ix_erp_users_role ON erp_users(role);
CREATE INDEX ix_erp_users_status ON erp_users(status);

CREATE TABLE erp_account_requests (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    requested_role VARCHAR(32) NOT NULL DEFAULT 'employee',
    decided_by VARCHAR(255),
    decided_at TIMESTAMPTZ,
    created_user_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_account_requests_email ON erp_account_requests(email);
CREATE INDEX ix_erp_account_requests_status ON erp_account_requests(status);
CREATE INDEX ix_erp_account_requests_requested_role ON erp_account_requests(requested_role);
CREATE INDEX ix_erp_account_requests_created_user_id ON erp_account_requests(created_user_id);
CREATE INDEX ix_erp_account_requests_created_at ON erp_account_requests(created_at);

CREATE TABLE erp_teams (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE erp_team_members (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES erp_teams(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES erp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_erp_team_members_team_user UNIQUE (team_id, user_id)
);

CREATE INDEX ix_erp_team_members_team_id ON erp_team_members(team_id);
CREATE INDEX ix_erp_team_members_user_id ON erp_team_members(user_id);

CREATE TABLE erp_tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_by_user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'todo',
    priority VARCHAR(32) NOT NULL DEFAULT 'normal',
    deadline_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX ix_erp_tasks_title ON erp_tasks(title);
CREATE INDEX ix_erp_tasks_assigned_by_user_id ON erp_tasks(assigned_by_user_id);
CREATE INDEX ix_erp_tasks_status ON erp_tasks(status);
CREATE INDEX ix_erp_tasks_priority ON erp_tasks(priority);
CREATE INDEX ix_erp_tasks_created_at ON erp_tasks(created_at);

CREATE TABLE erp_task_assignments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES erp_tasks(id) ON DELETE CASCADE,
    assignee_user_id BIGINT REFERENCES erp_users(id) ON DELETE CASCADE,
    assignee_team_id BIGINT REFERENCES erp_teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_erp_task_assignment_target CHECK (
        (assignee_user_id IS NOT NULL AND assignee_team_id IS NULL)
        OR (assignee_user_id IS NULL AND assignee_team_id IS NOT NULL)
    )
);

CREATE INDEX ix_erp_task_assignments_task_id ON erp_task_assignments(task_id);
CREATE INDEX ix_erp_task_assignments_user_id ON erp_task_assignments(assignee_user_id);
CREATE INDEX ix_erp_task_assignments_team_id ON erp_task_assignments(assignee_team_id);

CREATE TABLE erp_task_documents (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES erp_tasks(id) ON DELETE CASCADE,
    document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
    original_filename VARCHAR(255),
    file_path TEXT,
    visibility VARCHAR(32) NOT NULL DEFAULT 'assignees',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_task_documents_task_id ON erp_task_documents(task_id);
CREATE INDEX ix_erp_task_documents_document_id ON erp_task_documents(document_id);
CREATE INDEX ix_erp_task_documents_visibility ON erp_task_documents(visibility);

CREATE TABLE erp_task_comments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES erp_tasks(id) ON DELETE CASCADE,
    author_user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'comment',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_task_comments_task_id ON erp_task_comments(task_id);
CREATE INDEX ix_erp_task_comments_author_user_id ON erp_task_comments(author_user_id);
CREATE INDEX ix_erp_task_comments_kind ON erp_task_comments(kind);
CREATE INDEX ix_erp_task_comments_created_at ON erp_task_comments(created_at);

CREATE TABLE erp_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_notifications_user_id ON erp_notifications(user_id);
CREATE INDEX ix_erp_notifications_type ON erp_notifications(type);
CREATE INDEX ix_erp_notifications_created_at ON erp_notifications(created_at);

