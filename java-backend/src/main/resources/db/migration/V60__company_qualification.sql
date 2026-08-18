-- Şirketin kendi yeterlik envanteri: the figures an idare will ask it to prove.
--
-- The announcement states its bars as ratios against the bid — work experience worth 50% of what
-- you offer, turnover 25% — so the only thing missing to answer "can we bid on this" is what the
-- company actually has. That is what this table holds, and it is entered once rather than
-- remembered by whoever happens to be preparing the file.
--
-- One row, like the tender watch profile: this is the company's own position, not a per-user one.
-- Every figure is nullable on purpose. A company that has not entered its turnover must be told
-- "we do not know" and never "you do not qualify" — the second is a claim, and a wrong one sends
-- somebody away from a tender they could have won.
CREATE TABLE erp_company_qualification (
    id                      BIGSERIAL PRIMARY KEY,
    -- The strongest single iş deneyim belgesi the company holds, which is what gets submitted.
    experience_amount       NUMERIC(18,2),
    experience_currency     VARCHAR(3) DEFAULT 'TRY',
    -- Its date decides whether it is still inside the tender's window: five years for hizmet,
    -- fifteen for yapım, counted from the tender date.
    experience_date         DATE,
    experience_subject      TEXT,
    -- Turnover for the last two closed years; the law lets the average of the two be used when the
    -- most recent year alone falls short.
    turnover_last_year      NUMERIC(18,2),
    turnover_previous_year  NUMERIC(18,2),
    -- Turnover earned in this line of work specifically, which carries a lower bar than the total.
    sector_turnover         NUMERIC(18,2),
    -- Balance-sheet ratios, compared against the announcement's own thresholds.
    current_ratio           NUMERIC(6,3),
    equity_ratio            NUMERIC(6,3),
    bank_debt_ratio         NUMERIC(6,3),
    bank_reference_limit    NUMERIC(18,2),
    updated_by              VARCHAR(160),
    updated_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeded empty so the screen has a row to edit rather than a create-then-edit dance, and so the
-- checklist can say "not entered yet" from the first day.
INSERT INTO erp_company_qualification (created_at) VALUES (NOW());
