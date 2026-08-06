package com.docsbot.ops.auth;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Password recovery. Before this existed, a forgotten password meant a permanently locked-out
 * account: no self-service reset, no admin reset, and no way for a signed-in user to change their
 * own password.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class PasswordResetIntegrationTest {

    private static final String ORIGINAL = "OriginalPass123";
    private static final String TEMPORARY = "GeciciSifre2026";
    private static final String CHOSEN = "KendiSifrem2026";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpUserRepository userRepository;

    @BeforeEach
    void cleanDatabase() {
        userRepository.deleteAll();
    }

    @Test
    void adminResetLetsALockedOutEmployeeBackInAndFlagsTheTemporaryPassword() throws Exception {
        long userId = register("unutkan");

        mockMvc.perform(patch("/erp/users/" + userId + "/password")
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + TEMPORARY + "\"}"))
                .andExpect(status().isNoContent());

        // The old password stops working and the temporary one gets them back in.
        login("unutkan", ORIGINAL).andExpect(status().isUnauthorized());
        login("unutkan", TEMPORARY).andExpect(status().isOk());

        Assertions.assertTrue(userRepository.findById(userId).orElseThrow().isMustChangePassword(),
                "an admin-set password is temporary until its owner replaces it");
    }

    @Test
    void theOwnerReplacesTheTemporaryPasswordAndTheFlagClears() throws Exception {
        long userId = register("degistiren");
        mockMvc.perform(patch("/erp/users/" + userId + "/password")
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + TEMPORARY + "\"}"))
                .andExpect(status().isNoContent());

        String token = JsonPath.read(
                login("degistiren", TEMPORARY).andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$.access_token");

        mockMvc.perform(patch("/erp/me/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current_password\":\"" + TEMPORARY + "\",\"new_password\":\"" + CHOSEN + "\"}"))
                .andExpect(status().isNoContent());

        login("degistiren", CHOSEN).andExpect(status().isOk());
        login("degistiren", TEMPORARY).andExpect(status().isUnauthorized());
        Assertions.assertFalse(userRepository.findById(userId).orElseThrow().isMustChangePassword());
    }

    @Test
    void changingOwnPasswordRequiresTheCurrentOne() throws Exception {
        register("dogrulayan");
        String token = JsonPath.read(
                login("dogrulayan", ORIGINAL).andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$.access_token");

        mockMvc.perform(patch("/erp/me/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current_password\":\"YanlisSifre123\",\"new_password\":\"" + CHOSEN + "\"}"))
                .andExpect(status().isUnauthorized());

        login("dogrulayan", ORIGINAL).andExpect(status().isOk());
    }

    @Test
    void anEmployeeCannotResetSomeoneElsesPassword() throws Exception {
        long victimId = register("kurban");
        register("saldirgan");
        String token = JsonPath.read(
                login("saldirgan", ORIGINAL).andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$.access_token");

        mockMvc.perform(patch("/erp/users/" + victimId + "/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + TEMPORARY + "\"}"))
                .andExpect(status().isForbidden());

        login("kurban", ORIGINAL).andExpect(status().isOk());
    }

    @Test
    void aResetPasswordMustStillMeetTheRegistrationMinimum() throws Exception {
        long userId = register("zayif");
        mockMvc.perform(patch("/erp/users/" + userId + "/password")
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"1234\"}"))
                .andExpect(status().isBadRequest());
    }

    private long register(String username) throws Exception {
        String response = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test Kullanici","username":"%s","password":"%s","code":"test-join-code"}
                                """.formatted(username, ORIGINAL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.user_id")).longValue();
    }

    private org.springframework.test.web.servlet.ResultActions login(String username, String password)
            throws Exception {
        return mockMvc.perform(post("/erp/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }
}
