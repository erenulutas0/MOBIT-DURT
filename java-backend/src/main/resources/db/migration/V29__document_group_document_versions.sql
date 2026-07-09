CREATE TABLE IF NOT EXISTS document_group_document_versions (
    id BIGSERIAL PRIMARY KEY,
    group_document_id BIGINT NOT NULL REFERENCES document_group_documents(id) ON DELETE CASCADE,
    document_id BIGINT NOT NULL REFERENCES documents(id),
    version_number INTEGER NOT NULL,
    uploaded_by_user_id BIGINT,
    uploaded_by VARCHAR(255) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_document_group_document_versions UNIQUE(group_document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_group_document_versions_mapping
    ON document_group_document_versions(group_document_id, version_number DESC, id DESC);
