CREATE TABLE erp_mobile_push_outbox (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES erp_notifications(id) ON DELETE CASCADE,
    token_id BIGINT NOT NULL REFERENCES erp_mobile_push_tokens(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_erp_mobile_push_outbox_notification_token
    ON erp_mobile_push_outbox(notification_id, token_id);

CREATE INDEX ix_erp_mobile_push_outbox_due
    ON erp_mobile_push_outbox(status, next_attempt_at, id);

