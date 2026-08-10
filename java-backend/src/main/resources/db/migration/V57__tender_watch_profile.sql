-- Hangi ihaleler bu şirketin işi: iş kolu ve il tercihleri.
--
-- The bulletin publishes three hundred announcements a day and a company can do maybe six of them.
-- Until now the filtering was something a person did by hand every morning, which means it only
-- happened on mornings somebody remembered. Recorded here, it happens whether anyone logs in or
-- not: the screen opens on the company's own work, and the morning job can say "four today" instead
-- of leaving three hundred for somebody to read.
--
-- One row per deployment. Every customer gets their own database (see scripts/provision-tenant.sh),
-- so "the company" is the whole installation and there is nothing to scope this by.
CREATE TABLE erp_tender_watch_profile (
    id              BIGSERIAL PRIMARY KEY,
    -- TenderCategory codes, comma separated. Empty means every line of work, which is the honest
    -- default for a company that has not said yet — showing nothing until a form is filled in is
    -- how a feature gets a reputation for being broken.
    categories      TEXT         NOT NULL DEFAULT '',
    -- Province names as the bulletin spells them, comma separated. Empty means the whole country.
    provinces       TEXT         NOT NULL DEFAULT '',
    -- Whether the morning job announces what it found. Separate from the filters because "narrow
    -- my screen" and "wake me up about it" are different appetites.
    notify_daily    BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by      VARCHAR(160)
);

-- Seeded so the rest of the code never has to answer "what if there is no row yet". Empty filters
-- mean everything, so an untouched profile behaves exactly as the screen did before it existed.
INSERT INTO erp_tender_watch_profile (categories, provinces, notify_daily) VALUES ('', '', TRUE);
