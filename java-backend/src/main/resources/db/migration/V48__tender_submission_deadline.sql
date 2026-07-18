-- Tender submission deadline (son teklif tarihi). Nullable: set by the admin per tender; the
-- reminder cron alerts as it approaches (7g/3g/24s/4s) and once when it passes.
ALTER TABLE tenders ADD COLUMN submission_deadline_at TIMESTAMPTZ;
