-- The SLA escalation scans look up the latest activity event per task and type
-- (findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc) every 60 seconds.
-- The existing single-column indexes on task_id and event_type force a sort;
-- this composite makes the lookup a direct index walk.
CREATE INDEX IF NOT EXISTS ix_erp_activity_events_task_type_created
    ON erp_activity_events (task_id, event_type, created_at DESC, id DESC);
