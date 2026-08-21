package com.docsbot.ops.auth.application;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.docsbot.ops.auth.AuthSessionResponse;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EmployeeAuthenticationServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-15T09:00:00Z");

    private final ErpUserRepository userRepository = mock(ErpUserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final RefreshTokenService refreshTokenService = mock(RefreshTokenService.class);
    private final AuthAuditRecorder auditRecorder = mock(AuthAuditRecorder.class);

    private final LoginFailureRecorder loginFailureRecorder = new LoginFailureRecorder(userRepository);

    private final EmployeeAuthenticationService service = new EmployeeAuthenticationService(
            userRepository, passwordEncoder, refreshTokenService, auditRecorder,
            (com.docsbot.ops.erp.application.NotificationService) null, "", loginFailureRecorder);

    private ErpUser user;

    @BeforeEach
    void setUp() {
        user = ErpUser.approvedEmployee("Ada", "ada@mobit.com.tr", null, "hashed", NOW);
        ReflectionTestUtils.setField(user, "id", 7L);
        when(userRepository.findByEmailIgnoreCase("ada@mobit.com.tr")).thenReturn(Optional.of(user));
        // The recorder re-reads the account inside its own transaction; here that is the same
        // instance, so the threshold still accumulates. What a mock cannot show is whether the
        // increment survives the rollback the rejection causes — see the integration test.
        lenient().when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        lenient().when(refreshTokenService.issueSession(anyString(), anyString(), anyString(), anyString(), anyLong(), anyString()))
                .thenReturn(new AuthSessionResponse("EMPLOYEE", "Ada", 7L, "ada@mobit.com.tr", "a", "Bearer", 3600, "r", 100));
    }

    @Test
    void successfulLoginClearsFailureState() {
        when(passwordEncoder.matches("correct", "hashed")).thenReturn(true);

        AuthSessionResponse session = service.login("ada@mobit.com.tr", "correct");

        assertThat(session).isNotNull();
        assertThat(user.isLocked(NOW.plusSeconds(1))).isFalse();
    }

    @Test
    void wrongPasswordThrowsGenericUnauthorized() {
        when(passwordEncoder.matches(eq("wrong"), any())).thenReturn(false);

        assertThatThrownBy(() -> service.login("ada@mobit.com.tr", "wrong"))
                .isInstanceOf(AuthExceptions.Unauthorized.class);
    }

    @Test
    void locksAccountAfterEightFailures() {
        when(passwordEncoder.matches(eq("wrong"), any())).thenReturn(false);

        for (int attempt = 0; attempt < 8; attempt++) {
            assertThatThrownBy(() -> service.login("ada@mobit.com.tr", "wrong"))
                    .isInstanceOf(AuthExceptions.Unauthorized.class);
        }

        // 9th attempt — even with the correct password — is rejected because the account is locked.
        when(passwordEncoder.matches(eq("correct"), any())).thenReturn(true);
        assertThatThrownBy(() -> service.login("ada@mobit.com.tr", "correct"))
                .isInstanceOf(AuthExceptions.TooManyRequests.class);
    }

    @Test
    void unknownEmailThrowsGenericUnauthorizedWithoutLockup() {
        when(userRepository.findByEmailIgnoreCase("ghost@mobit.com.tr")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login("ghost@mobit.com.tr", "whatever"))
                .isInstanceOf(AuthExceptions.Unauthorized.class);
    }
}
