-- One-time cleanup of the accumulated notification backlog.
--
-- Why: nothing has ever pruned erp_notifications (RetentionService covers activity events and the
-- push outbox only), and until the per-task supersede landed, every deadline edit re-armed a task's
-- alert keys so the next scan re-created its whole 72h/48h/24h/12h/6h/1h + overdue + 5-nudge ladder.
-- The result is a permanently unread pile (~49 for this deployment) that a fresh install still sees,
-- because the supersede only collapses a stack when a NEWER alert for the same task arrives — rows
-- with no future sibling stay unread forever.
--
-- Everything below only flips read_at; no notification row is deleted, so history is intact.

-- 1) Collapse each task's deadline stack per recipient: keep the newest alert unread, retire the
--    older, now-obsolete stages (a 24h warning makes the 72h one meaningless).
UPDATE erp_notifications stale
   SET read_at = NOW()
 WHERE stale.read_at IS NULL
   AND stale.task_id IS NOT NULL
   AND stale.type IN ('task_due_soon', 'task_overdue', 'task_overdue_nudge',
                      'manager_due_soon_digest', 'manager_overdue_digest')
   AND EXISTS (
       SELECT 1
         FROM erp_notifications newer
        WHERE newer.user_id = stale.user_id
          AND newer.task_id = stale.task_id
          AND newer.type IN ('task_due_soon', 'task_overdue', 'task_overdue_nudge',
                             'manager_due_soon_digest', 'manager_overdue_digest')
          AND (newer.created_at, newer.id) > (stale.created_at, stale.id));

-- 2) ANY outstanding notification for a finished task is pure noise, whatever its type — the task
--    is closed, nothing about it is still actionable.
UPDATE erp_notifications settled
   SET read_at = NOW()
 WHERE settled.read_at IS NULL
   AND settled.task_id IS NOT NULL
   AND EXISTS (
       SELECT 1
         FROM erp_tasks task
        WHERE task.id = settled.task_id
          AND task.status IN ('DONE', 'CANCELLED'));

-- 2b) Orphans: task_id was added without a foreign key, so a row whose task no longer exists can
--     never be reached by any per-task clear path and would stay unread forever.
UPDATE erp_notifications orphan
   SET read_at = NOW()
 WHERE orphan.read_at IS NULL
   AND orphan.task_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM erp_tasks task WHERE task.id = orphan.task_id);

-- 3) Recurring digests/reports carry no task_id, so the per-task supersede can never reach them and
--    each has been adding a row every scan/week/weekday forever. Only the most recent of each kind
--    is actionable, so retire every older unread copy per recipient.
UPDATE erp_notifications stale
   SET read_at = NOW()
 WHERE stale.read_at IS NULL
   AND stale.type IN ('manager_overdue_escalation', 'manager_weekly_digest',
                      'performance_report', 'assistant_briefing')
   AND EXISTS (
       SELECT 1
         FROM erp_notifications newer
        WHERE newer.user_id = stale.user_id
          AND newer.type = stale.type
          AND (newer.created_at, newer.id) > (stale.created_at, stale.id));

-- 3b) Per-(recipient, task, type) collapse for the types where only the newest matters: escalation
--     rungs, plus the task-chatter types whose call sites pass a NULL event key. The unique dedup
--     index is partial (WHERE event_key IS NOT NULL), so those got no dedup at either layer and
--     every task edit or comment minted another permanent unread row.
UPDATE erp_notifications stale
   SET read_at = NOW()
 WHERE stale.read_at IS NULL
   AND stale.task_id IS NOT NULL
   AND stale.type IN ('task_blocked_escalation', 'task_completion_approval_escalation',
                      'task_updated', 'manager_message', 'employee_help_message',
                      'task_completion_requested', 'task_completion_approved',
                      'task_completion_rejected')
   AND EXISTS (
       SELECT 1
         FROM erp_notifications newer
        WHERE newer.user_id = stale.user_id
          AND newer.task_id = stale.task_id
          AND newer.type = stale.type
          AND (newer.created_at, newer.id) > (stale.created_at, stale.id));

-- 4) Backstop for whatever the targeted passes missed: a SYSTEM alert nobody acted on in two weeks
--    is not going to be acted on, and must not keep a badge lit forever. Scoped to machine-generated
--    types on purpose — an unread message or task assignment from a human still matters after two
--    weeks of leave. Ongoing enforcement of this window lives in RetentionService.retireStale-
--    Notifications (same type list), so the backlog cannot rebuild.
UPDATE erp_notifications
   SET read_at = NOW()
 WHERE read_at IS NULL
   AND created_at < NOW() - INTERVAL '14 days'
   AND type IN ('task_due_soon', 'task_overdue', 'task_overdue_nudge',
                'manager_due_soon_digest', 'manager_overdue_digest',
                'manager_overdue_escalation', 'manager_weekly_digest',
                'performance_report', 'assistant_briefing',
                'task_blocked_escalation', 'task_completion_approval_escalation',
                'tender_deadline_soon', 'tender_deadline_passed');

-- 5) Index the two ongoing retention scans: both filter on read-state + created_at with no user
--    predicate, and today only a plain (created_at) index exists.
CREATE INDEX IF NOT EXISTS ix_erp_notifications_unread_created
    ON erp_notifications(created_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_erp_notifications_read_created
    ON erp_notifications(created_at) WHERE read_at IS NOT NULL;
