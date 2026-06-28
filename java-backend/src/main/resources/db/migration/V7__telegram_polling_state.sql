CREATE TABLE telegram_polling_state (
    bot_key VARCHAR(64) PRIMARY KEY,
    next_update_id BIGINT,
    lease_owner VARCHAR(128),
    lease_until TIMESTAMPTZ,
    failure_update_id BIGINT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_telegram_polling_state_lease_until
    ON telegram_polling_state(lease_until);
