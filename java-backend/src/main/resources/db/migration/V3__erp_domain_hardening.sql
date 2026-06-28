UPDATE erp_tasks SET status = UPPER(status), priority = UPPER(priority);

ALTER TABLE erp_tasks ALTER COLUMN status SET DEFAULT 'TODO';
ALTER TABLE erp_tasks ALTER COLUMN priority SET DEFAULT 'NORMAL';

CREATE UNIQUE INDEX ux_erp_task_assignments_user
    ON erp_task_assignments (task_id, assignee_user_id)
    WHERE assignee_user_id IS NOT NULL;

CREATE UNIQUE INDEX ux_erp_task_assignments_team
    ON erp_task_assignments (task_id, assignee_team_id)
    WHERE assignee_team_id IS NOT NULL;

CREATE INDEX ix_erp_tasks_deadline_at ON erp_tasks(deadline_at);
