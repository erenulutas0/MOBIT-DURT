package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_mobile_push_outbox")
public class ErpMobilePushOutbox {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_RETRY = "RETRY";
    public static final String STATUS_DELIVERED = "DELIVERED";
    public static final String STATUS_DEAD = "DEAD";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    @Column(name = "token_id", nullable = false)
    private Long tokenId;

    @Column(nullable = false, length = 32)
    private String status = STATUS_PENDING;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 5;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "last_error", length = 512)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ErpMobilePushOutbox() {
    }

    public static ErpMobilePushOutbox create(long notificationId, long tokenId, Instant now) {
        ErpMobilePushOutbox outbox = new ErpMobilePushOutbox();
        outbox.notificationId = notificationId;
        outbox.tokenId = tokenId;
        outbox.status = STATUS_PENDING;
        outbox.nextAttemptAt = now;
        outbox.createdAt = now;
        outbox.updatedAt = now;
        return outbox;
    }

    public void markDelivered(Instant now) {
        this.status = STATUS_DELIVERED;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markRetry(String error, Instant nextAttemptAt, Instant now) {
        this.attempts += 1;
        this.status = attempts >= maxAttempts ? STATUS_DEAD : STATUS_RETRY;
        this.nextAttemptAt = nextAttemptAt;
        this.lastError = truncate(error);
        this.updatedAt = now;
    }

    public void markDead(String error, Instant now) {
        this.status = STATUS_DEAD;
        this.lastError = truncate(error);
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public Long getNotificationId() {
        return notificationId;
    }

    public Long getTokenId() {
        return tokenId;
    }

    public String getStatus() {
        return status;
    }

    public int getAttempts() {
        return attempts;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    private String truncate(String value) {
        return value == null ? null : value.substring(0, Math.min(value.length(), 512));
    }
}

