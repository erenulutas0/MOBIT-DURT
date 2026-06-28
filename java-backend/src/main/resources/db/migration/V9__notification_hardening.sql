ALTER TABLE erp_notifications
    ADD COLUMN task_id BIGINT,
    ADD COLUMN priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN event_key VARCHAR(160);

CREATE UNIQUE INDEX ux_erp_notifications_user_event_key
    ON erp_notifications(user_id, event_key)
    WHERE event_key IS NOT NULL;

CREATE INDEX ix_erp_notifications_task_created
    ON erp_notifications(task_id, created_at DESC, id DESC)
    WHERE task_id IS NOT NULL;

CREATE TABLE erp_notification_preferences (
    user_id BIGINT PRIMARY KEY,
    task_assigned_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    manager_message_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    employee_help_message_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    completion_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    deadline_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    browser_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE erp_notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES erp_notifications(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_message VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_notification_deliveries_notification
    ON erp_notification_deliveries(notification_id, created_at DESC, id DESC);

CREATE INDEX ix_erp_notification_deliveries_status
    ON erp_notification_deliveries(status, created_at DESC);
