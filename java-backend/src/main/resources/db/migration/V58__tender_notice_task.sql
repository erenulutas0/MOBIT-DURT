-- Bir ilan için açılmış hazırlık görevi.
--
-- The bulletin says a tender closes at 11:30 on the 24th; the task board is where somebody
-- actually does something about it. Linking the two means the announcement can show that it is
-- already being worked on, and — more to the point — that two people reading the same bulletin on
-- the same morning do not open the same job twice.
--
-- Nullable and unconstrained on purpose. The notice is a copy of a public document that gets purged
-- after the retention window, and a task must outlive the announcement that prompted it: what the
-- company decided to do about a tender is its own record, not EKAP's.
ALTER TABLE erp_tender_notices ADD COLUMN IF NOT EXISTS task_id BIGINT;

CREATE INDEX IF NOT EXISTS ix_tender_notices_task ON erp_tender_notices(task_id)
    WHERE task_id IS NOT NULL;
