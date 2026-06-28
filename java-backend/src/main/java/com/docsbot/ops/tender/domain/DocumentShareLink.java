package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_share_links")
public class DocumentShareLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "last_accessed_at")
    private Instant lastAccessedAt;

    @Column(name = "access_count", nullable = false)
    private long accessCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected DocumentShareLink() {
    }

    public static DocumentShareLink create(
            long documentId,
            String tokenHash,
            String createdBy,
            Instant expiresAt,
            Instant now
    ) {
        DocumentShareLink link = new DocumentShareLink();
        link.documentId = documentId;
        link.tokenHash = tokenHash;
        link.createdBy = createdBy;
        link.expiresAt = expiresAt;
        link.createdAt = now;
        return link;
    }

    public boolean activeAt(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            revokedAt = now;
        }
    }

    public void recordAccess(Instant now) {
        lastAccessedAt = now;
        accessCount += 1;
    }

    public Long getId() {
        return id;
    }

    public Long getDocumentId() {
        return documentId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public Instant getLastAccessedAt() {
        return lastAccessedAt;
    }

    public long getAccessCount() {
        return accessCount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
