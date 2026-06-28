CREATE TABLE erp_activity_events (
    id BIGSERIAL PRIMARY KEY,
    actor_type VARCHAR(32) NOT NULL,
    actor_user_id BIGINT,
    actor_name VARCHAR(255),
    event_type VARCHAR(64) NOT NULL,
    subject_type VARCHAR(64) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    task_id BIGINT,
    details VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_erp_activity_events_actor_user_id ON erp_activity_events(actor_user_id);
CREATE INDEX ix_erp_activity_events_event_type ON erp_activity_events(event_type);
CREATE INDEX ix_erp_activity_events_subject ON erp_activity_events(subject_type, subject_id);
CREATE INDEX ix_erp_activity_events_task_id ON erp_activity_events(task_id);
CREATE INDEX ix_erp_activity_events_created_at ON erp_activity_events(created_at);
