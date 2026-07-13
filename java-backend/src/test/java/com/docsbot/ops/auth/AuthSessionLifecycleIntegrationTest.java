package com.docsbot.ops.auth;

import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpRefreshTokenRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class AuthSessionLifecycleIntegrationTest {

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
    void refreshRotatesTokenAndLogoutRevokesCurrentToken() throws Exception {
        String loginResponse = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"admin","password":"admin123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refresh_token").isString())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String firstRefreshToken = JsonPath.read(loginResponse, "$.refresh_token");

        String refreshResponse = mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(firstRefreshToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("admin"))
                .andExpect(jsonPath("$.access_token").isString())
                .andExpect(jsonPath("$.refresh_token").isString())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String secondRefreshToken = JsonPath.read(refreshResponse, "$.refresh_token");
        assertThat(secondRefreshToken).isNotEqualTo(firstRefreshToken);

        mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(firstRefreshToken)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/erp/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(secondRefreshToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(secondRefreshToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void replayingARotatedTokenRevokesTheWholeFamilyIncludingTheLiveDescendant() throws Exception {
        String firstRefreshToken = JsonPath.read(mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"admin","password":"admin123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.refresh_token");

        // Legitimate rotation forward: T1 -> T2 -> T3. T3 is the live token an attacker who
        // stole T1 and rotated it would now be holding.
        String secondRefreshToken = JsonPath.read(mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(firstRefreshToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.refresh_token");
        String thirdRefreshToken = JsonPath.read(mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(secondRefreshToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.refresh_token");

        // The live descendant works right up until the replay.
        // Replaying the already-rotated T1 is the theft signal.
        mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(firstRefreshToken)))
                .andExpect(status().isUnauthorized());

        // Family revocation: the attacker's still-fresh T3 is now dead too.
        mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(thirdRefreshToken)))
                .andExpect(status().isUnauthorized());

        assertThat(refreshTokenRepository.findAll())
                .allSatisfy(token -> assertThat(token.getRevokedAt()).isNotNull());
    }

    @Test
    void deletingAUserRevokesTheirRefreshTokensSoTheyCannotKeepRotating() throws Exception {
        String adminToken = loginAdmin();

        // Approve an employee, log them in, capture their refresh token.
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Silinecek Kullanici","email":"silinecek@example.com","password":"StrongPass123!"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(requestResponse, "$.id")).longValue();

        String approval = mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(approval, "$.id")).longValue();

        String loginResponse = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"silinecek@example.com","password":"StrongPass123!"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Keep this token unused so that deletion-revocation is the ONLY thing that can
        // invalidate it (using it once would rotate-and-revoke it, hiding the real cause).
        String employeeRefreshToken = JsonPath.read(loginResponse, "$.refresh_token");

        // Admin deletes the user.
        mockMvc.perform(delete("/erp/users/{userId}", userId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNoContent());

        // The never-used refresh token is now revoked purely by the deletion.
        mockMvc.perform(post("/erp/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshJson(employeeRefreshToken)))
                .andExpect(status().isUnauthorized());
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }

    private String refreshJson(String token) {
        return """
                {"refresh_token":"%s"}
                """.formatted(token);
    }
}
