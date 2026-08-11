-- İhale sonuç ilanları: who won, at what price, against how many bidders.
--
-- The announcements bulletin says what is being bought. This one says what it went for, and the
-- pair is what a company actually prices a bid against: the idare's own estimate beside the sum
-- the work was let for. On an ordinary day the gap between the two runs from nothing to sixty
-- percent, and no amount of reading the announcement tells you which.
--
-- One row is one contract, not one tender. A tender split into kısım awards each lot separately —
-- an eleven-item drug tender produces eleven rows sharing one İKN and one estimate — so the
-- estimate belongs to the tender and the amount belongs to the contract. Comparing a single lot's
-- price against the whole tender's estimate reads as a 99% discount and is nonsense; partial_award
-- is what keeps that off the screen.
CREATE TABLE erp_tender_results (
    id                  BIGSERIAL PRIMARY KEY,
    ikn                 VARCHAR(32)  NOT NULL,
    bulletin_type       VARCHAR(20)  NOT NULL,
    bulletin_date       DATE         NOT NULL,
    authority           VARCHAR(400),
    title               TEXT,
    -- Where the work is — never where the winner sits. Left null rather than guessed: a tender
    -- filed under the wrong province is worse than one filed under none.
    province            VARCHAR(40),
    work_place          TEXT,
    -- Açık, pazarlık, belli istekliler — how it was procured, which changes what the price means.
    procedure_name      VARCHAR(160),
    tender_date         DATE,
    contract_date       DATE,
    -- NUMERIC, not float: these are contract sums and 54524045.00 has to survive being read back.
    estimated_cost      NUMERIC(18,2),
    estimated_currency  VARCHAR(3),
    contract_amount     NUMERIC(18,2),
    contract_currency   VARCHAR(3),
    bid_count           INTEGER,
    valid_bid_count     INTEGER,
    winner              TEXT,
    winner_address      TEXT,
    winner_province     VARCHAR(40),
    -- TenderCategory#code(), the same vocabulary as the announcements, so one watch profile
    -- filters both screens.
    category            VARCHAR(40),
    -- True once this tender is known to have been awarded in lots: either the announcement carries
    -- the "Sözleşmeye Esas Kısımlarının Yaklaşık Maliyeti" line, or a second contract has turned up
    -- under the same İKN. The second half is why this is stored rather than computed on read —
    -- lots are published days apart, and today's row has to be corrected when tomorrow's arrives.
    partial_award       BOOLEAN      NOT NULL DEFAULT FALSE,
    body                TEXT         NOT NULL,
    -- A short hash of winner + amount, filled by the application. One İKN legitimately produces
    -- several contracts in the same bulletin, one per lot, and what separates them is who took
    -- them and for how much; hashed because a Turkish joint venture's full title runs well past
    -- what belongs in an index.
    award_key           VARCHAR(40)  NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Re-reading a bulletin must not duplicate it, so a re-run after a failure is safe to do.
    CONSTRAINT ux_tender_result UNIQUE (ikn, bulletin_date, bulletin_type, award_key)
);

-- How this gets read: the result for one tender the company was following, results in my province,
-- and results in my line of work.
CREATE INDEX ix_tender_results_ikn ON erp_tender_results(ikn);
CREATE INDEX ix_tender_results_province ON erp_tender_results(province);
CREATE INDEX ix_tender_results_category_date ON erp_tender_results(category, bulletin_date DESC);
