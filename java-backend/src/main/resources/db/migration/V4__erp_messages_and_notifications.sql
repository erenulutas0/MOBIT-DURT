CREATE INDEX ix_erp_task_comments_task_created
    ON erp_task_comments(task_id, created_at DESC, id DESC);

CREATE INDEX ix_erp_notifications_user_created
    ON erp_notifications(user_id, created_at DESC, id DESC);

CREATE INDEX ix_erp_notifications_user_unread
    ON erp_notifications(user_id, read_at)
    WHERE read_at IS NULL;
