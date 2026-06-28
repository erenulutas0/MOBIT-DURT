CREATE TABLE erp_direct_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_type VARCHAR(16) NOT NULL,
    sender_user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    sender_name VARCHAR(255) NOT NULL,
    recipient_type VARCHAR(16) NOT NULL,
    recipient_user_id BIGINT REFERENCES erp_users(id) ON DELETE SET NULL,
    recipient_name VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_erp_direct_messages_sender CHECK (
        (sender_type = 'admin' AND sender_user_id IS NULL)
        OR (sender_type = 'user' AND sender_user_id IS NOT NULL)
    ),
    CONSTRAINT ck_erp_direct_messages_recipient CHECK (
        (recipient_type = 'admin' AND recipient_user_id IS NULL)
        OR (recipient_type = 'user' AND recipient_user_id IS NOT NULL)
    )
);

CREATE INDEX ix_erp_direct_messages_sender ON erp_direct_messages(sender_type, sender_user_id);
CREATE INDEX ix_erp_direct_messages_recipient ON erp_direct_messages(recipient_type, recipient_user_id);
CREATE INDEX ix_erp_direct_messages_created_at ON erp_direct_messages(created_at);
CREATE INDEX ix_erp_direct_messages_read_at ON erp_direct_messages(read_at);
