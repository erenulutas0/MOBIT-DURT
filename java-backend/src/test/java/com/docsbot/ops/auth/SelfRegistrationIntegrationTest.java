package com.docsbot.ops.auth;

import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpRefreshTokenRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class SelfRegistrationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpRefreshTokenRepository refreshTokenRepository;

    @Autowired
    private ErpUserRepository userRepository;

    @Autowired
    private ErpAccountRequestRepository accountRequestRepository;

    @BeforeEach
    void cleanDatabase() {
        refreshTokenRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registeringWithoutAnEmailLogsInImmediatelyAndAllowsUsernameLogin() throws Exception {
        // Self-registration is auto-approved and returns a session right away — no admin step.
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ahmet Yilmaz","username":"ahmet","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("user"))
                .andExpect(jsonPath("$.access_token").isString())
                .andExpect(jsonPath("$.refresh_token").isString());

        // The account can then log in via the shared identifier field using the username.
        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"ahmet","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isString());
    }

    @Test
    void usernameIsCaseInsensitiveAndUnique() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ahmet","username":"ahmet","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Baska Ahmet","username":"AHMET","password":"OtherPass123"}
                                """))
                .andExpect(status().isConflict());
    }

    @Test
    void registeringWithAnEmailAllowsLoginByEmailToo() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Mehmet","username":"mehmet","email":"mehmet@example.com","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"mehmet@example.com","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isString());
    }

    @Test
    void aShortPasswordIsRejected() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Kisa","username":"kisa","password":"short"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anInvalidUsernameIsRejected() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bosluklu","username":"ad soyad","password":"StrongPass123"}
                                """))
                .andExpect(status().isBadRequest());
    }
}
