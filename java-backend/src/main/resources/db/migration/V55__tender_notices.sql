-- Published tenders from the Kamu İhale Bülteni, so a company can be told which of the day's
-- announcements look like work it has done before.
--
-- The whole announcement body is kept, not just the parsed fields. The fields say what a tender
-- is — who, where, when — and the body says whether it is one this company can actually do:
-- "3x240/25 mm² XLPE kablo" appears in the body and nowhere else, and matching on titles alone
-- would put an electrical contractor in front of every tender with "kablo" in its name.
CREATE TABLE erp_tender_notices (
    id              BIGSERIAL PRIMARY KEY,
    -- İhale Kayıt Numarası, e.g. 2026/1273278. Not unique on its own: the same tender comes back
    -- as a correction and again as a cancellation, and each of those is a row worth keeping.
    ikn             VARCHAR(32)  NOT NULL,
    -- Which of the four daily bulletins it came from.
    bulletin_type   VARCHAR(20)  NOT NULL,
    bulletin_date   DATE         NOT NULL,
    -- ilan | on_ilan | duzeltme | iptal | diger — taken from the bulletin's own section heading.
    -- A cancelled tender shown as something to bid on is worse than an empty screen, so this is
    -- read from the source rather than inferred from which fields happen to be filled in.
    kind            VARCHAR(20)  NOT NULL,
    section         VARCHAR(160),
    authority       VARCHAR(400),
    address         TEXT,
    -- One of the 81, matched against a list rather than taken from the end of the address, which
    -- is only sometimes "İlçe/İl". Null when the announcement names none.
    province        VARCHAR(40),
    -- Kept as printed as well as parsed: the printed form is what a user recognises from the
    -- bulletin, and the parsed one is what sorting and reminders need.
    tender_at_text  VARCHAR(64),
    tender_at       TIMESTAMPTZ,
    title           TEXT,
    quantity        TEXT,
    delivery_place  TEXT,
    body            TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Re-reading a bulletin must not duplicate it: the same announcement in the same bulletin is
    -- the same row, so a re-run after a failure is safe to do.
    CONSTRAINT ux_tender_notice UNIQUE (ikn, kind, bulletin_date, bulletin_type)
);

-- The three ways this gets read: what is happening in my province, what closes soon, and which
-- announcements are live rather than cancelled.
CREATE INDEX ix_tender_notices_province ON erp_tender_notices(province);
CREATE INDEX ix_tender_notices_tender_at ON erp_tender_notices(tender_at);
CREATE INDEX ix_tender_notices_kind_date ON erp_tender_notices(kind, bulletin_date DESC);
