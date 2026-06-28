package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_push_subscriptions")
public class ErpPushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String endpoint;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String p256dh;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String auth;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "failure_count", nullable = false)
    private int failureCount;

    @Column(name = "last_success_at")
    private Instant lastSuccessAt;

    @Column(name = "last_failure_at")
    private Instant lastFailureAt;

    @Column(name = "last_error", length = 512)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ErpPushSubscription() {
    }

    public static ErpPushSubscription create(
            long userId,
            String endpoint,
            String p256dh,
            String auth,
            String userAgent,
            Instant now
    ) {
        ErpPushSubscription subscription = new ErpPushSubscription();
        subscription.userId = userId;
        subscription.endpoint = endpoint;
        subscription.p256dh = p256dh;
        subscription.auth = auth;
        subscription.userAgent = userAgent;
        subscription.active = true;
        subscription.createdAt = now;
        subscription.updatedAt = now;
        return subscription;
    }

    public void refresh(long userId, String p256dh, String auth, String userAgent, Instant now) {
        this.userId = userId;
        this.p256dh = p256dh;
        this.auth = auth;
        this.userAgent = userAgent;
        this.active = true;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markSuccess(Instant now) {
        this.failureCount = 0;
        this.lastSuccessAt = now;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markFailure(String error, boolean deactivate, Instant now) {
        this.failureCount += 1;
        this.lastFailureAt = now;
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 512));
        this.active = !deactivate;
        this.updatedAt = now;
    }

    public void deactivate(Instant now) {
        this.active = false;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public String getP256dh() {
        return p256dh;
    }

    public String getAuth() {
        return auth;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public boolean isActive() {
        return active;
    }
}
