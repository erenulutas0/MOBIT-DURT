-- Şirketin kendi teklifleri: what we offered, and what happened to it.
--
-- The one thing no competitor can hold. Every tender-tracking service in the country reads the same
-- public bulletin and can tell a company what a job went for; none of them knows what *this*
-- company bid, because that number never leaves the company. Recorded here, it turns the public
-- result into a private lesson: "you were 3% over, for the third time, against the same firm".
--
-- The tender's own details are copied in rather than referenced. Announcements are a cached copy of
-- a public document and get purged after the retention window, while what a company offered is its
-- own record and has to outlive the bulletin that prompted it — the same reason a preparation task
-- is not a foreign key either.
CREATE TABLE erp_tender_bids (
    id              BIGSERIAL PRIMARY KEY,
    ikn             VARCHAR(32)  NOT NULL,
    -- The announcement this came from, while it still exists. Nullable and unconstrained.
    notice_id       BIGINT,
    title           TEXT,
    authority       VARCHAR(400),
    province        VARCHAR(40),
    category        VARCHAR(40),
    amount          NUMERIC(18,2) NOT NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'TRY',
    bid_at          DATE         NOT NULL,
    note            TEXT,
    -- Set only when somebody corrects what the figures implied: WON | LOST | UNCLEAR. The outcome
    -- is otherwise worked out on read from the published result, so a bid recorded today gets its
    -- answer by itself when the result bulletin catches up weeks later.
    outcome_override VARCHAR(16),
    recorded_by     VARCHAR(160),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    -- One bid per tender: a company offers once, and a second entry would double every average it
    -- ever appears in.
    CONSTRAINT ux_tender_bid UNIQUE (ikn)
);

CREATE INDEX ix_tender_bids_bid_at ON erp_tender_bids(bid_at DESC);
CREATE INDEX ix_tender_bids_authority ON erp_tender_bids(authority);
