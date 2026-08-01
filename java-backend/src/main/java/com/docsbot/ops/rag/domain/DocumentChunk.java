package com.docsbot.ops.rag.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One searchable passage of a document, with the vector its meaning maps to.
 *
 * <p>The model name rides along with every row because vectors from different models occupy
 * different spaces — comparing across them produces confident nonsense, so search filters on it and
 * a model change means a re-index rather than a silent quality collapse.
 */
@Entity
@Table(name = "erp_document_chunks")
public class DocumentChunk {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "chunk_index", nullable = false)
    private int chunkIndex;

    @Column(nullable = false)
    private String content;

    @Column(nullable = false)
    private byte[] embedding;

    @Column(nullable = false)
    private int dimensions;

    @Column(nullable = false, length = 96)
    private String model;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected DocumentChunk() {
    }

    public static DocumentChunk create(
            long documentId,
            int chunkIndex,
            String content,
            byte[] embedding,
            int dimensions,
            String model,
            Instant now
    ) {
        DocumentChunk chunk = new DocumentChunk();
        chunk.documentId = documentId;
        chunk.chunkIndex = chunkIndex;
        chunk.content = content;
        chunk.embedding = embedding;
        chunk.dimensions = dimensions;
        chunk.model = model;
        chunk.createdAt = now;
        return chunk;
    }

    public Long getId() {
        return id;
    }

    public Long getDocumentId() {
        return documentId;
    }

    public int getChunkIndex() {
        return chunkIndex;
    }

    public String getContent() {
        return content;
    }

    public byte[] getEmbedding() {
        return embedding;
    }

    public int getDimensions() {
        return dimensions;
    }

    public String getModel() {
        return model;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
