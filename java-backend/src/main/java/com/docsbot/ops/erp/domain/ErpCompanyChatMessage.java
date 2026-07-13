package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A single company-wide channel every authenticated user can post to. Unlike direct
 * messages and document-room chat, rows here are hard-deleted daily by a scheduled
 * purge (see CompanyChatService) — this is an ephemeral daily bulletin, not an archive.
 */
@Entity
@Table(name = "erp_company_chat_messages")
public class ErpCompanyChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "author_user_id")
    private Long authorUserId;

    @Column(name = "author_name", nullable = false)
    private String authorName;

    @Column(name = "author_role", nullable = false, length = 16)
    private String authorRole;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpCompanyChatMessage() {
    }

    public static ErpCompanyChatMessage create(
            Long authorUserId,
            String authorName,
            String authorRole,
            String body,
            Instant now
    ) {
        ErpCompanyChatMessage message = new ErpCompanyChatMessage();
        message.authorUserId = authorUserId;
        message.authorName = authorName;
        message.authorRole = authorRole;
        message.body = body;
        message.createdAt = now;
        return message;
    }

    public Long getId() {
        return id;
    }

    public Long getAuthorUserId() {
        return authorUserId;
    }

    public String getAuthorName() {
        return authorName;
    }

    public String getAuthorRole() {
        return authorRole;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
