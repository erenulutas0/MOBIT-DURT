CREATE TABLE erp_company_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    author_user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(16) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_company_chat_messages_created_at
    ON erp_company_chat_messages(created_at);
