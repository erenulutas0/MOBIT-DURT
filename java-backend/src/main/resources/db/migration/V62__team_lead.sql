-- Ekip lideri: the one member of a team allowed to hand out work inside it.
--
-- Until now every task in the company came from the admin account, which is fine for one office and
-- wrong for two: a site chief who cannot open a job for their own crew either waits for the owner
-- or the job never gets written down, and an operations tool that people work around stops being a
-- record of anything.
--
-- Held on the team rather than on the membership row because that is how people say it — "bu ekibin
-- lideri X" — and because a team has one. Nullable: a team without a lead simply keeps the old
-- behaviour, where only an admin assigns.
ALTER TABLE erp_teams ADD COLUMN IF NOT EXISTS lead_user_id BIGINT;

-- Deliberately not a foreign key to erp_users. Deleting an employee must not be blocked by a team
-- that still names them, and a lead who has left should read as "no lead" rather than take the
-- delete down with it. The application resolves the name and tolerates a missing one.
CREATE INDEX IF NOT EXISTS ix_erp_teams_lead ON erp_teams(lead_user_id)
    WHERE lead_user_id IS NOT NULL;
