CREATE TABLE erp_mobile_push_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    platform VARCHAR(32) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    token TEXT NOT NULL,
    app_version VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_error VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_erp_mobile_push_tokens_platform_device
    ON erp_mobile_push_tokens(platform, device_id);

CREATE INDEX ix_erp_mobile_push_tokens_user_active
    ON erp_mobile_push_tokens(user_id, active, updated_at DESC);
