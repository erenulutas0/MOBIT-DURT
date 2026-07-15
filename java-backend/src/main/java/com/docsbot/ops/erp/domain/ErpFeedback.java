package com.docsbot.ops.erp.domain;

import java.time.Instant;
import java.util.Locale;
import java.util.Set;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Employee feedback (bug report / suggestion / question) submitted from the mobile help area. */
@Entity
@Table(name = "erp_feedback")
public class ErpFeedback {

    private static final Set<String> CATEGORIES = Set.of("bug", "suggestion", "question", "other");
    private static final Set<String> STATUSES = Set.of("NEW", "READ", "RESOLVED");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "user_name", nullable = false)
    private String userName;

    @Column(nullable = false, length = 32)
    private String category;

    @Column(nullable = false)
    private String message;

    @Column(name = "app_version", length = 64)
    private String appVersion;

    @Column(nullable = false, length = 32)
    private String status = "NEW";

    @Column(name = "resolved_by")
    private String resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpFeedback() {
    }

    public static ErpFeedback create(
            Long userId,
            String userName,
            String category,
            String message,
            String appVersion,
            Instant now
    ) {
        ErpFeedback feedback = new ErpFeedback();
        feedback.userId = userId;
        feedback.userName = userName;
        feedback.category = normalizeCategory(category);
        feedback.message = message;
        feedback.appVersion = appVersion;
        feedback.status = "NEW";
        feedback.createdAt = now;
        return feedback;
    }

    private static String normalizeCategory(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return CATEGORIES.contains(normalized) ? normalized : "other";
    }

    /** Moves to NEW/READ/RESOLVED; RESOLVED stamps who and when. */
    public void updateStatus(String nextStatus, String decidedBy, Instant now) {
        String normalized = nextStatus == null ? "" : nextStatus.trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) {
            throw new IllegalArgumentException("Unknown feedback status");
        }
        status = normalized;
        if ("RESOLVED".equals(normalized)) {
            resolvedBy = decidedBy;
            resolvedAt = now;
        } else {
            resolvedBy = null;
            resolvedAt = null;
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getUserName() {
        return userName;
    }

    public String getCategory() {
        return category;
    }

    public String getMessage() {
        return message;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public String getStatus() {
        return status;
    }

    public String getResolvedBy() {
        return resolvedBy;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
