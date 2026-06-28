CREATE TABLE erp_refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    user_id BIGINT,
    email VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_refresh_tokens_user_id ON erp_refresh_tokens(user_id);
CREATE INDEX ix_erp_refresh_tokens_subject ON erp_refresh_tokens(subject);
CREATE INDEX ix_erp_refresh_tokens_expires_at ON erp_refresh_tokens(expires_at);
CREATE INDEX ix_erp_refresh_tokens_revoked_at ON erp_refresh_tokens(revoked_at);
