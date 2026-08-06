-- The company's own paperwork, the kind that expires and is asked for again at every tender:
-- imza sirküleri, oda kayıt belgesi, ticaret sicil gazetesi, SGK ve vergi borcu yoktur yazıları.
--
-- Separate from `documents` on purpose. That table holds what arrives about a tender — şartname,
-- sözleşme, ekler — each belonging to one tender and never expiring. These belong to the company,
-- are submitted over and over, and their whole point is a date that runs out. Modelling them as
-- tender documents would mean a validity column that is null for almost every row and a reminder
-- job that has to guess which rows it applies to.
--
-- Finding out that the imza sirküleri expired the week before is not a filing problem, it is a bid
-- that cannot be submitted, so the reminder is the feature and the record exists to drive it.
CREATE TABLE erp_company_credentials (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    -- Free text rather than an enum: every idare asks for its own combination, and a closed list
    -- would need a migration each time somebody meets a new one.
    kind            VARCHAR(80),
    issued_at       DATE,
    -- The reason this table exists. Nullable for the open-ended ones (a company that has no
    -- expiry on its ticaret sicil gazetesi still wants it filed next to the rest).
    valid_until     DATE,
    -- The scanned copy, when it has been uploaded. Set null rather than deleting the reminder if
    -- the file goes: the obligation outlives the scan.
    document_id     BIGINT REFERENCES documents(id) ON DELETE SET NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The reminder scan reads by expiry date; everything else here is small enough to scan.
CREATE INDEX ix_company_credentials_valid_until ON erp_company_credentials(valid_until);
