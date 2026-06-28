package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_mobile_push_tokens")
public class ErpMobilePushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 32)
    private String platform;

    @Column(name = "device_id", nullable = false, length = 128)
    private String deviceId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String token;

    @Column(name = "app_version", length = 64)
    private String appVersion;

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

    protected ErpMobilePushToken() {
    }

    public static ErpMobilePushToken create(
            long userId,
            String platform,
            String deviceId,
            String token,
            String appVersion,
            Instant now
    ) {
        ErpMobilePushToken pushToken = new ErpMobilePushToken();
        pushToken.userId = userId;
        pushToken.platform = platform;
        pushToken.deviceId = deviceId;
        pushToken.token = token;
        pushToken.appVersion = appVersion;
        pushToken.active = true;
        pushToken.createdAt = now;
        pushToken.updatedAt = now;
        return pushToken;
    }

    public void refresh(long userId, String token, String appVersion, Instant now) {
        this.userId = userId;
        this.token = token;
        this.appVersion = appVersion;
        this.active = true;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markQueued(Instant now) {
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markDelivered(Instant now) {
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

    public String getPlatform() {
        return platform;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public String getToken() {
        return token;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
