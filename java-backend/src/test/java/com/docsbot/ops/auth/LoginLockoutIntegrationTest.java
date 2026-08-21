package com.docsbot.ops.auth;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The lockout, against a real database, because a mock cannot see the thing that broke it.
 *
 * <p>The unit test for this has always passed: it hands the service a mocked repository that
 * returns the same in-memory account every time, so the counter accumulates on that object and the
 * threshold is reached. In production the counter lived in the transaction the rejection rolled
 * back, so nothing was ever written — every account in the table sat at zero for the life of the
 * installation while an attacker got unlimited attempts.
 *
 * <p>So this test asserts the row, not the object: after eight rejections the stored account must
 * be locked, and the ninth attempt must be refused even with the correct password.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class LoginLockoutIntegrationTest {

    private static final String PASSWORD = "StrongPass123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpUserRepository userRepository;

    @BeforeEach
    void setUp() throws Exception {
        userRepository.deleteAll();
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ada","username":"ada","password":"%s","code":"test-join-code"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk());
    }

    private void attempt(String password, int expectedStatus) throws Exception {
        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"ada","password":"%s"}
                                """.formatted(password)))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void failedAttemptsAreCountedInTheDatabase() throws Exception {
        attempt("wrong", 401);

        // The assertion the mocked test could not make: the number reached the row.
        ErpUser stored = userRepository.findByUsernameIgnoreCase("ada").orElseThrow();
        assertThat(stored.getFailedLoginCount()).isEqualTo(1);
    }

    @Test
    void eightFailuresLockTheAccountEvenAgainstTheRightPassword() throws Exception {
        for (int attempt = 0; attempt < 8; attempt++) {
            attempt("wrong", 401);
        }

        ErpUser stored = userRepository.findByUsernameIgnoreCase("ada").orElseThrow();
        assertThat(stored.getLockedUntil()).isNotNull();

        // 429, not 401: the account is locked, and the correct password does not lift it.
        attempt(PASSWORD, 429);
    }

    @Test
    void aSuccessfulLoginClearsWhatWasCounted() throws Exception {
        attempt("wrong", 401);
        attempt("wrong", 401);

        attempt(PASSWORD, 200);

        // Otherwise seven honest typos spread over a year would lock somebody out on the eighth.
        ErpUser stored = userRepository.findByUsernameIgnoreCase("ada").orElseThrow();
        assertThat(stored.getFailedLoginCount()).isZero();
        assertThat(stored.getLockedUntil()).isNull();
    }
}
