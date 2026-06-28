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

@Service
public class RefreshTokenService {

    private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

    private final ErpRefreshTokenRepository tokenRepository;
    private final TokenService tokenService;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public RefreshTokenService(
            ObjectProvider<ErpRefreshTokenRepository> tokenRepository,
            TokenService tokenService
    ) {
        this(tokenRepository.getIfAvailable(), tokenService, Clock.systemUTC());
    }

    RefreshTokenService(
            ErpRefreshTokenRepository tokenRepository,
            TokenService tokenService,
            Clock clock
    ) {
        this.tokenRepository = tokenRepository;
        this.tokenService = tokenService;
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
                .filter(token -> token.activeAt(now))
                .orElseThrow(() -> new AuthExceptions.Unauthorized("Invalid refresh token"));

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
