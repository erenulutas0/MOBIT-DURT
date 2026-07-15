package com.docsbot.ops.auth.domain;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

class ErpAccountRequestTest {

    private static final Instant NOW = Instant.parse("2026-07-15T09:00:00Z");
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4); // low cost for test speed

    private ErpAccountRequest requestWithCode(String code, Instant expiresAt) {
        ErpAccountRequest request = ErpAccountRequest.pending("Ada", "ada@x.com", null, "pw", NOW);
        request.startVerification(encoder.encode(code), expiresAt);
        return request;
    }

    @Test
    void correctCodeVerifies() {
        ErpAccountRequest request = requestWithCode("123456", NOW.plus(Duration.ofMinutes(15)));
        assertThat(request.isEmailVerified()).isFalse();

        assertThat(request.verifyCode("123456", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.VERIFIED);
        assertThat(request.isEmailVerified()).isTrue();
    }

    @Test
    void wrongCodeIsRejectedAndCounted() {
        ErpAccountRequest request = requestWithCode("123456", NOW.plus(Duration.ofMinutes(15)));
        assertThat(request.verifyCode("000000", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.INVALID_CODE);
        assertThat(request.isEmailVerified()).isFalse();
    }

    @Test
    void locksOutAfterFiveWrongAttempts() {
        ErpAccountRequest request = requestWithCode("123456", NOW.plus(Duration.ofMinutes(15)));
        for (int i = 0; i < 4; i++) {
            assertThat(request.verifyCode("000000", encoder, NOW))
                    .isEqualTo(ErpAccountRequest.VerificationResult.INVALID_CODE);
        }
        assertThat(request.verifyCode("000000", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.LOCKED_OUT);
        // Even the correct code no longer works once locked out.
        assertThat(request.verifyCode("123456", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.EXPIRED);
    }

    @Test
    void expiredCodeIsRejected() {
        ErpAccountRequest request = requestWithCode("123456", NOW.minus(Duration.ofMinutes(1)));
        assertThat(request.verifyCode("123456", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.EXPIRED);
    }

    @Test
    void alreadyVerifiedIsIdempotent() {
        ErpAccountRequest request = requestWithCode("123456", NOW.plus(Duration.ofMinutes(15)));
        request.verifyCode("123456", encoder, NOW);
        assertThat(request.verifyCode("123456", encoder, NOW))
                .isEqualTo(ErpAccountRequest.VerificationResult.ALREADY_VERIFIED);
    }
}
