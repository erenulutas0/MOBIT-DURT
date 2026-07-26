-- Flexible scheduling. A task could only ever say "due at this exact instant", but real tender work
-- is expressed as a relation to a date: start AFTER the bid opens, finish BEFORE submission, hand it
-- in BY Friday, do it BETWEEN two dates.
--
-- deadline_at keeps its meaning for every kind — "must be done by" — so the whole due-soon/overdue
-- ladder keeps working untouched. starts_at is the second anchor: the "not before" date for AFTER,
-- and the window opening for BETWEEN.
ALTER TABLE erp_tasks
    ADD COLUMN IF NOT EXISTS schedule_kind VARCHAR(16) NOT NULL DEFAULT 'AT',
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

-- Existing rows keep exactly the behaviour they had: a plain due date.
COMMENT ON COLUMN erp_tasks.schedule_kind IS
    'AT | BEFORE | UNTIL | AFTER | BETWEEN — how deadline_at and starts_at should be read';
