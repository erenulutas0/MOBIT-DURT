CREATE TABLE legacy_import_runs (
    id BIGSERIAL PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_checksum VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    documents_inserted INTEGER NOT NULL DEFAULT 0,
    tenders_inserted INTEGER NOT NULL DEFAULT 0,
    bindings_inserted INTEGER NOT NULL DEFAULT 0,
    setups_inserted INTEGER NOT NULL DEFAULT 0,
    organizations_inserted INTEGER NOT NULL DEFAULT 0,
    skipped_rows INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX ix_legacy_import_runs_checksum ON legacy_import_runs(source_checksum);
CREATE INDEX ix_legacy_import_runs_started_at ON legacy_import_runs(started_at);
