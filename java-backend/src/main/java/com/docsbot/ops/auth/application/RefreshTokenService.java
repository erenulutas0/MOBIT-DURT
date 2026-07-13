package com.docsbot.ops.auth.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.AuthSessionResponse;
import com.docsbot.ops.auth.TokenService;
import com.docsbot.ops.auth.domain.ErpRefreshToken;
import com.docsbot.ops.auth.infrastructure.ErpRefreshTokenRepository;
import com.docsbot.ops.common.tx.NewTransactionExecutor;

@Service
public class RefreshTokenService {

    private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

    private final ErpRefreshTokenRepository tokenRepository;
    private final TokenService tokenService;
    private final NewTransactionExecutor newTransactionExecutor;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public RefreshTokenService(
            ObjectProvider<ErpRefreshTokenRepository> tokenRepository,
            TokenService tokenService,
            NewTransactionExecutor newTransactionExecutor
    ) {
        this(tokenRepository.getIfAvailable(), tokenService, newTransactionExecutor, Clock.systemUTC());
    }

    RefreshTokenService(
            ErpRefreshTokenRepository tokenRepository,
            TokenService tokenService,
            NewTransactionExecutor newTransactionExecutor,
            Clock clock
    ) {
        this.tokenRepository = tokenRepository;
        this.tokenService = tokenService;
        this.newTransactionExecutor = newTransactionExecutor;
        this.clock = clock;
    }

    @Transactional
    public AuthSessionResponse issueSession(
            String responseRole,
            String subject,
            String tokenRole,
            String displayName,
            Long userId,
            String email
    ) {
        TokenService.IssuedToken accessToken = tokenService.issue(
                subject,
                tokenRole,
                displayName,
                userId,
                email);
        IssuedRefreshToken refreshToken = tokenRepository == null
                ? new IssuedRefreshToken("", "", 0)
                : createRefreshToken(subject, tokenRole, displayName, userId, email);
        return new AuthSessionResponse(
                responseRole,
                displayName,
                userId,
                email,
                accessToken.value(),
                "Bearer",
                accessToken.expiresInSeconds(),
                refreshToken.value(),
                refreshToken.expiresInSeconds());
    }

    @Transactional
    public AuthSessionResponse rotate(String rawRefreshToken) {
        if (tokenRepository == null) {
            throw new AuthExceptions.Unauthorized("Refresh tokens require the PostgreSQL profile");
        }
        Instant now = clock.instant();
        String currentHash = hash(rawRefreshToken);
        ErpRefreshToken current = tokenRepository.findByTokenHash(currentHash)
                .orElseThrow(() -> new AuthExceptions.Unauthorized("Invalid refresh token"));
        if (current.getRevokedAt() != null) {
            // Reuse of an already-rotated token. The legitimate holder rotated it forward, so
            // a replay means someone else is also holding a token from this family (theft).
            // Revoke every active token for this subject, forcing a fresh login everywhere and
            // killing the attacker's still-valid descendant along with it. This must land in a
            // separate transaction because we reject the request right after: throwing here
            // would otherwise roll the revocation back with the rest of the rotate() tx.
            String subject = current.getSubject();
            newTransactionExecutor.call(() -> tokenRepository.revokeActiveForSubject(subject, now));
            throw new AuthExceptions.Unauthorized("Refresh token reuse detected");
        }
        if (!current.activeAt(now)) {
            // Expired but never rotated — nothing to revoke, just reject.
            throw new AuthExceptions.Unauthorized("Invalid refresh token");
        }

        TokenService.IssuedToken accessToken = tokenService.issue(
                current.getSubject(),
                current.getRole(),
                current.getDisplayName(),
                current.getUserId(),
                current.getEmail());
        IssuedRefreshToken replacement = createRefreshToken(
                current.getSubject(),
                current.getRole(),
                current.getDisplayName(),
                current.getUserId(),
                current.getEmail());
        current.revoke(now, replacement.hash());

        return new AuthSessionResponse(
                "ADMIN".equals(current.getRole()) ? "admin" : "user",
                current.getDisplayName(),
                current.getUserId(),
                current.getEmail(),
                accessToken.value(),
                "Bearer",
                accessToken.expiresInSeconds(),
                replacement.value(),
                replacement.expiresInSeconds());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (tokenRepository == null) {
            return;
        }
        Instant now = clock.instant();
        tokenRepository.findByTokenHash(hash(rawRefreshToken))
                .ifPresent(token -> token.revoke(now, null));
    }

    /**
     * Revoke every active refresh token for a user — call when the account is deleted or its
     * role changes so an off-boarded/demoted employee cannot keep rotating (up to the 30-day
     * refresh TTL) with their old role. The current access token (stateless JWT) still stands
     * until its ~60-minute expiry; capping the refresh chain is the meaningful mitigation.
     */
    @Transactional
    public int revokeAllForUser(long userId) {
        if (tokenRepository == null) {
            return 0;
        }
        return tokenRepository.revokeActiveForUser(userId, clock.instant());
    }

    private IssuedRefreshToken createRefreshToken(
            String subject,
            String role,
            String displayName,
            Long userId,
            String email
    ) {
        if (tokenRepository == null) {
            throw new AuthExceptions.Unauthorized("Refresh tokens require the PostgreSQL profile");
        }
        Instant now = clock.instant();
        Instant expiresAt = now.plus(REFRESH_TOKEN_TTL);
        String value = randomToken();
        String hash = hash(value);
        tokenRepository.save(ErpRefreshToken.create(
                hash,
                subject,
                role,
                displayName,
                userId,
                email,
                expiresAt,
                now));
        return new IssuedRefreshToken(value, hash, REFRESH_TOKEN_TTL.toSeconds());
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        if (value == null || value.isBlank()) {
            throw new AuthExceptions.Unauthorized("Invalid refresh token");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private record IssuedRefreshToken(String value, String hash, long expiresInSeconds) {
    }
}
