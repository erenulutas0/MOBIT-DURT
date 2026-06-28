package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "document_user_states",
        uniqueConstraints = @UniqueConstraint(
                name = "ux_document_user_states_owner_document",
                columnNames = {"owner_key", "document_id"}))
public class DocumentUserState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_key", nullable = false)
    private String ownerKey;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(nullable = false)
    private boolean favorite;

    @Column(name = "favorited_at")
    private Instant favoritedAt;

    @Column(name = "last_accessed_at")
    private Instant lastAccessedAt;

    @Column(name = "access_count", nullable = false)
    private long accessCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DocumentUserState() {
    }

    public static DocumentUserState create(String ownerKey, long documentId, Instant now) {
        DocumentUserState state = new DocumentUserState();
        state.ownerKey = ownerKey;
        state.documentId = documentId;
        state.createdAt = now;
        state.updatedAt = now;
        return state;
    }

    public void setFavorite(boolean favorite, Instant now) {
        this.favorite = favorite;
        this.favoritedAt = favorite ? now : null;
        this.updatedAt = now;
    }

    public void recordAccess(Instant now) {
        this.lastAccessedAt = now;
        this.accessCount += 1;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public String getOwnerKey() {
        return ownerKey;
    }

    public Long getDocumentId() {
        return documentId;
    }

    public boolean isFavorite() {
        return favorite;
    }

    public Instant getFavoritedAt() {
        return favoritedAt;
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

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
