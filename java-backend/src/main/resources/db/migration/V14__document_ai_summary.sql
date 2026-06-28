ALTER TABLE documents
    ADD COLUMN ai_summary TEXT,
    ADD COLUMN ai_summary_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN ai_summary_generated_at TIMESTAMPTZ,
    ADD COLUMN ai_summary_error TEXT;

CREATE INDEX ix_documents_ai_summary_status
    ON documents(ai_summary_status);
