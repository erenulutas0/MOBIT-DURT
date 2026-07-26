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

    // Chosen at self-registration; nullable so legacy accounts (which authenticate by email) are
    // unaffected. Unique via a lower(username) index; multiple NULLs are allowed.
    @Column(length = 64)
    private String username;

    @Column(unique = true)
    private String email;

    private String phone;

    // Job title (ünvan); admin-managed, empty until assigned.
    @Column(length = 120)
    private String title;

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

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

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

    /**
     * A self-registered employee: chooses a username (required) with optional email/phone. The
     * account is active immediately (approvedAt = now) — self-registration is auto-approved.
     */
    public static ErpUser registeredEmployee(
            String name,
            String username,
            String email,
            String phone,
            String passwordHash,
            Instant now
    ) {
        ErpUser user = new ErpUser();
        user.name = name;
        user.username = username;
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

    /**
     * An admin hands the owner a temporary password. It is known to someone other than the owner, so
     * the account is flagged until they replace it. Repeated failed attempts are what usually drive
     * someone to ask for a reset, so the lockout is lifted too — otherwise the new password would
     * still be refused for the rest of the lock window.
     */
    public void resetPasswordTo(String passwordHash) {
        this.passwordHash = passwordHash;
        this.mustChangePassword = true;
        clearLoginFailures();
    }

    /** The owner sets a password only they know, which clears the temporary-credential flag. */
    public void changePasswordTo(String passwordHash) {
        this.passwordHash = passwordHash;
        this.mustChangePassword = false;
        clearLoginFailures();
    }

    public boolean isMustChangePassword() {
        return mustChangePassword;
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

    public String getUsername() {
        return username;
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

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = (title == null || title.isBlank()) ? null : title.trim();
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
