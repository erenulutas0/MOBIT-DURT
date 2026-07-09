ALTER TABLE erp_task_assignments
    ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'participant';

CREATE INDEX ix_erp_task_assignments_role
    ON erp_task_assignments(role);
