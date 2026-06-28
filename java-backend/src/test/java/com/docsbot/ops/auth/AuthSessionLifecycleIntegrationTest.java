package com.docsbot.ops.auth;

import com.docsbot.ops.auth.infrastructure.ErpRefreshTokenRepository;
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

    @BeforeEach
    void cleanDatabase() {
        refreshTokenRepository.deleteAll();
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

    private String refreshJson(String token) {
        return """
                {"refresh_token":"%s"}
                """.formatted(token);
    }
}
