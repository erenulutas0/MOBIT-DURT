-- What the work is, as opposed to how it is procured.
--
-- The bulletin's own four types — mal, yapım, hizmet, danışmanlık — say the second and not the
-- first: a cable contractor and a bakery read the same "mal" bulletin and neither can use most of
-- it. Stored rather than computed on read so it can be filtered, counted, and corrected in place
-- when the keyword table turns out to be wrong about something.
--
-- Its own migration rather than a line in V55, which has already run in production. Editing an
-- applied migration changes its checksum, and Flyway then refuses to start the application at all
-- — a schema change that turns into an outage on the next deploy.
ALTER TABLE erp_tender_notices ADD COLUMN IF NOT EXISTS category VARCHAR(40);

CREATE INDEX IF NOT EXISTS ix_tender_notices_category ON erp_tender_notices(category);
