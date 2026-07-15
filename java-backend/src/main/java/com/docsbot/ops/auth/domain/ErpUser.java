package com.docsbot.ops.auth.domain;

import java.time.Duration;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_users")
public class ErpUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private UserRole role = UserRole.EMPLOYEE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private UserStatus status = UserStatus.OFFLINE;

    @Column(unique = true)
    private String email;

    private String phone;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "document_network_visible", nullable = false)
    private boolean documentNetworkVisible;

    @Column(name = "failed_login_count", nullable = false)
    private int failedLoginCount;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    // After this many consecutive failed logins the account is locked for LOCK_DURATION.
    private static final int MAX_FAILED_LOGINS = 8;
    private static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    protected ErpUser() {
    }

    public static ErpUser approvedEmployee(
            String name,
            String email,
            String phone,
            String passwordHash,
            Instant now
    ) {
        ErpUser user = new ErpUser();
        user.name = name;
        user.email = email;
        user.phone = phone;
        user.passwordHash = passwordHash;
        user.role = UserRole.EMPLOYEE;
        user.status = UserStatus.OFFLINE;
        user.approvedAt = now;
        user.createdAt = now;
        return user;
    }

    public static ErpUser approvedUser(
            String name,
            UserRole role,
            String email,
            String phone,
            Instant now
    ) {
        ErpUser user = new ErpUser();
        user.name = name;
        user.role = role;
        user.status = UserStatus.OFFLINE;
        user.email = email;
        user.phone = phone;
        user.approvedAt = now;
        user.createdAt = now;
        return user;
    }

    public void updatePresence(UserStatus status, Instant now) {
        this.status = status;
        this.lastSeenAt = now;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }

    /** Records a failed login; locks the account once the failure threshold is crossed. */
    public void registerFailedLogin(Instant now) {
        failedLoginCount += 1;
        if (failedLoginCount >= MAX_FAILED_LOGINS) {
            lockedUntil = now.plus(LOCK_DURATION);
            failedLoginCount = 0;
        }
    }

    /** Clears failure state on a successful login (or an expired lock). */
    public void clearLoginFailures() {
        failedLoginCount = 0;
        lockedUntil = null;
    }

    public void setDocumentNetworkVisible(boolean visible) {
        this.documentNetworkVisible = visible;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public UserRole getRole() {
        return role;
    }

    public UserStatus getStatus() {
        return status;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isDocumentNetworkVisible() {
        return documentNetworkVisible;
    }
}
