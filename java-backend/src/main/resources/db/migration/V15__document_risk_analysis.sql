ALTER TABLE documents
    ADD COLUMN ai_risk_analysis TEXT,
    ADD COLUMN ai_risk_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN ai_risk_generated_at TIMESTAMPTZ,
    ADD COLUMN ai_risk_error TEXT;

CREATE INDEX ix_documents_ai_risk_status
    ON documents(ai_risk_status);
