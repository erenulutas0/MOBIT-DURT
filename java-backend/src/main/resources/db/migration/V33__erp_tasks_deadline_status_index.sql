CREATE INDEX ix_erp_tasks_deadline_status
    ON erp_tasks(deadline_at, status);
