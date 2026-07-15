-- In-app feedback (bug reports / suggestions from employees, surfaced in the web admin panel)
-- and admin-published announcements (shown as a dismissible overlay after login).
CREATE TABLE erp_feedback (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    category VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    app_version VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_erp_feedback_status_created ON erp_feedback(status, created_at DESC);

CREATE TABLE erp_announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_erp_announcements_active ON erp_announcements(active, updated_at DESC);
