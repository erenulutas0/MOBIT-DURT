ALTER TABLE documents
    ADD COLUMN extracted_facts TEXT,
    ADD COLUMN fact_extraction_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN fact_extracted_at TIMESTAMPTZ,
    ADD COLUMN fact_extraction_error TEXT;

CREATE INDEX ix_documents_fact_extraction_status
    ON documents(fact_extraction_status);
