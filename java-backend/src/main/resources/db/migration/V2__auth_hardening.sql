UPDATE erp_users SET role = UPPER(role), status = UPPER(status);
UPDATE erp_account_requests SET status = UPPER(status), requested_role = UPPER(requested_role);

ALTER TABLE erp_users ALTER COLUMN role SET DEFAULT 'EMPLOYEE';
ALTER TABLE erp_users ALTER COLUMN status SET DEFAULT 'OFFLINE';
ALTER TABLE erp_account_requests ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE erp_account_requests ALTER COLUMN requested_role SET DEFAULT 'EMPLOYEE';

CREATE UNIQUE INDEX ux_erp_users_email_normalized
    ON erp_users (LOWER(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX ux_erp_account_requests_pending_email
    ON erp_account_requests (LOWER(email))
    WHERE status = 'PENDING';

CREATE TABLE auth_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor VARCHAR(255),
    event_type VARCHAR(64) NOT NULL,
    subject_type VARCHAR(64),
    subject_id VARCHAR(128),
    outcome VARCHAR(32) NOT NULL,
    ip_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_auth_audit_events_actor ON auth_audit_events(actor);
CREATE INDEX ix_auth_audit_events_event_type ON auth_audit_events(event_type);
CREATE INDEX ix_auth_audit_events_created_at ON auth_audit_events(created_at);
