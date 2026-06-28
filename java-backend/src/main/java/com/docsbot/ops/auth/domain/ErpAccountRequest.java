package com.docsbot.ops.auth.domain;

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
@Table(name = "erp_account_requests")
public class ErpAccountRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String email;

    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AccountRequestStatus status = AccountRequestStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "requested_role", nullable = false, length = 32)
    private UserRole requestedRole = UserRole.EMPLOYEE;

    @Column(name = "decided_by")
    private String decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "created_user_id")
    private Long createdUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpAccountRequest() {
    }

    public static ErpAccountRequest pending(
            String name,
            String email,
            String phone,
            String passwordHash,
            Instant now
    ) {
        ErpAccountRequest request = new ErpAccountRequest();
        request.name = name;
        request.email = email;
        request.phone = phone;
        request.passwordHash = passwordHash;
        request.status = AccountRequestStatus.PENDING;
        request.requestedRole = UserRole.EMPLOYEE;
        request.createdAt = now;
        return request;
    }

    public void approve(String decidedBy, Long userId, Instant now) {
        requirePending();
        status = AccountRequestStatus.APPROVED;
        this.decidedBy = decidedBy;
        decidedAt = now;
        createdUserId = userId;
    }

    public void reject(String decidedBy, Instant now) {
        requirePending();
        status = AccountRequestStatus.REJECTED;
        this.decidedBy = decidedBy;
        decidedAt = now;
    }

    private void requirePending() {
        if (status != AccountRequestStatus.PENDING) {
            throw new IllegalStateException("Account request has already been decided");
        }
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
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

    public AccountRequestStatus getStatus() {
        return status;
    }

    public UserRole getRequestedRole() {
        return requestedRole;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Long getCreatedUserId() {
        return createdUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
