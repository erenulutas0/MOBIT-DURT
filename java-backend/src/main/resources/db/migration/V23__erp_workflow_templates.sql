CREATE TABLE erp_workflow_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    task_priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    recurrence_type VARCHAR(32) NOT NULL,
    recurrence_interval INTEGER NOT NULL DEFAULT 1,
    recurrence_zone VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul',
    deadline_offset_minutes BIGINT,
    next_run_at TIMESTAMPTZ NOT NULL,
    last_run_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_erp_workflow_templates_interval CHECK (recurrence_interval > 0),
    CONSTRAINT ck_erp_workflow_templates_deadline CHECK (
        deadline_offset_minutes IS NULL OR deadline_offset_minutes > 0
    )
);

CREATE INDEX ix_erp_workflow_templates_due
    ON erp_workflow_templates(active, next_run_at);

CREATE TABLE erp_workflow_template_assignments (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES erp_workflow_templates(id) ON DELETE CASCADE,
    assignee_user_id BIGINT REFERENCES erp_users(id) ON DELETE CASCADE,
    assignee_team_id BIGINT REFERENCES erp_teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_erp_workflow_template_assignment_target CHECK (
        (assignee_user_id IS NOT NULL AND assignee_team_id IS NULL)
        OR (assignee_user_id IS NULL AND assignee_team_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX ux_erp_workflow_template_assignments_user
    ON erp_workflow_template_assignments(template_id, assignee_user_id)
    WHERE assignee_user_id IS NOT NULL;

CREATE UNIQUE INDEX ux_erp_workflow_template_assignments_team
    ON erp_workflow_template_assignments(template_id, assignee_team_id)
    WHERE assignee_team_id IS NOT NULL;

ALTER TABLE erp_tasks
    ADD COLUMN workflow_template_id BIGINT REFERENCES erp_workflow_templates(id) ON DELETE SET NULL;

ALTER TABLE erp_tasks
    ADD COLUMN scheduled_for TIMESTAMPTZ;

CREATE UNIQUE INDEX ux_erp_tasks_template_schedule
    ON erp_tasks(workflow_template_id, scheduled_for)
    WHERE workflow_template_id IS NOT NULL AND scheduled_for IS NOT NULL;

CREATE INDEX ix_erp_tasks_workflow_template_id ON erp_tasks(workflow_template_id);
