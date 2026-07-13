ALTER TABLE erp_tasks
    ADD COLUMN document_group_id BIGINT REFERENCES document_groups(id) ON DELETE SET NULL;

CREATE INDEX ix_erp_tasks_document_group
    ON erp_tasks(document_group_id)
    WHERE document_group_id IS NOT NULL;
