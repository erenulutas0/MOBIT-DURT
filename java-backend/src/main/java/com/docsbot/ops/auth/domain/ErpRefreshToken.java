package com.docsbot.ops.auth.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_refresh_tokens")
public class ErpRefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false, length = 32)
    private String role;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "user_id")
    private Long userId;

    private String email;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "replaced_by_token_hash", length = 64)
    private String replacedByTokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpRefreshToken() {
    }

    public static ErpRefreshToken create(
            String tokenHash,
            String subject,
            String role,
            String displayName,
            Long userId,
            String email,
            Instant expiresAt,
            Instant now
    ) {
        ErpRefreshToken token = new ErpRefreshToken();
        token.tokenHash = tokenHash;
        token.subject = subject;
        token.role = role;
        token.displayName = displayName;
        token.userId = userId;
        token.email = email;
        token.expiresAt = expiresAt;
        token.createdAt = now;
        return token;
    }

    public boolean activeAt(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    public void revoke(Instant now, String replacementHash) {
        this.revokedAt = now;
        this.replacedByTokenHash = replacementHash;
    }

    public Long getId() {
        return id;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public String getSubject() {
        return subject;
    }

    public String getRole() {
        return role;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Long getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
