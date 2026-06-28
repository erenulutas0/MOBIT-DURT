CREATE INDEX ix_erp_task_documents_task_created
    ON erp_task_documents(task_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX ux_erp_task_documents_file_path
    ON erp_task_documents(file_path)
    WHERE file_path IS NOT NULL;
