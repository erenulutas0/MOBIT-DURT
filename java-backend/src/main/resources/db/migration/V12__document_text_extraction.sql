ALTER TABLE documents
    ADD COLUMN extracted_text TEXT,
    ADD COLUMN text_extraction_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN text_extracted_at TIMESTAMPTZ,
    ADD COLUMN text_extraction_error TEXT;

CREATE INDEX ix_documents_text_extraction_status
    ON documents(text_extraction_status);
