-- Semantic search over company documents ("şirket asistanı"): the retrieval half of RAG.
--
-- Documents already carry extracted_text (Tika). That is one long blob per file, which is useless
-- for answering a question — you need the PARAGRAPH the answer is in, and you need to be able to
-- say which file and where it came from. So text is split into overlapping passages, each stored
-- with the vector its meaning maps to.
--
-- The vector lives in a BYTEA (packed float32) rather than a pgvector column on purpose: the
-- production database runs postgres:17-alpine, which has no pgvector, and swapping a live
-- database's image is not something to do casually. At this corpus size cosine similarity over the
-- chunks is a few milliseconds in the application. If the corpus outgrows that, the move to
-- pgvector is mechanical — the column becomes vector(N) and the scan becomes an index lookup.
CREATE TABLE erp_document_chunks (
    id              BIGSERIAL PRIMARY KEY,
    document_id     BIGINT      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INT         NOT NULL,
    content         TEXT        NOT NULL,
    -- Packed float32 array, big-endian, `dimensions` entries long.
    embedding       BYTEA       NOT NULL,
    dimensions      INT         NOT NULL,
    -- Which model produced it: a re-index after a model change must not mix vector spaces, because
    -- distances between vectors from different models are meaningless.
    model           VARCHAR(96) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ux_document_chunk UNIQUE (document_id, chunk_index)
);

CREATE INDEX ix_document_chunks_document ON erp_document_chunks(document_id);
CREATE INDEX ix_document_chunks_model ON erp_document_chunks(model);
