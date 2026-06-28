CREATE TABLE document_user_states (
    id BIGSERIAL PRIMARY KEY,
    owner_key VARCHAR(255) NOT NULL,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    favorited_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_document_user_states_owner_document UNIQUE (owner_key, document_id)
);

CREATE INDEX ix_document_user_states_favorites
    ON document_user_states(owner_key, favorite, favorited_at);
CREATE INDEX ix_document_user_states_recent
    ON document_user_states(owner_key, last_accessed_at);

CREATE TABLE document_share_links (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_by VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_document_share_links_document_id
    ON document_share_links(document_id, created_at);
CREATE INDEX ix_document_share_links_active
    ON document_share_links(expires_at, revoked_at);
