ALTER TABLE erp_tasks
    ADD COLUMN parent_task_id BIGINT REFERENCES erp_tasks(id) ON DELETE SET NULL;

CREATE INDEX ix_erp_tasks_parent_task
    ON erp_tasks(parent_task_id)
    WHERE parent_task_id IS NOT NULL;

CREATE TABLE erp_task_dependencies (
    id BIGSERIAL PRIMARY KEY,
    predecessor_task_id BIGINT NOT NULL REFERENCES erp_tasks(id) ON DELETE CASCADE,
    successor_task_id BIGINT NOT NULL REFERENCES erp_tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ux_erp_task_dependencies UNIQUE (predecessor_task_id, successor_task_id),
    CONSTRAINT ck_erp_task_dependencies_no_self CHECK (predecessor_task_id <> successor_task_id)
);

CREATE INDEX ix_erp_task_dependencies_successor
    ON erp_task_dependencies(successor_task_id);
