package com.docsbot.ops.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        // TRUNCATE ... CASCADE clears users plus every row that references them (messages, tokens,
        // account requests, ...) in one shot. A plain "delete from erp_users" trips the
        // ck_erp_direct_messages_sender check constraint when earlier test classes left message rows
        // behind (their sender_user_id gets SET NULL while the other sender columns stay populated),
        // and that failure surfaces only under CI's test ordering — so avoid ordered deletes entirely.
        jdbcTemplate.execute("TRUNCATE TABLE erp_users CASCADE");
    }

    @Test
    void registeringWithoutAnEmailLogsInImmediatelyAndAllowsUsernameLogin() throws Exception {
        // Self-registration is auto-approved and returns a session right away — no admin step.
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ahmet Yilmaz","username":"ahmet","password":"StrongPass123","code":"test-join-code"}
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
                                {"name":"Ahmet","username":"ahmet","password":"StrongPass123","code":"test-join-code"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Baska Ahmet","username":"AHMET","password":"OtherPass123","code":"test-join-code"}
                                """))
                .andExpect(status().isConflict());
    }

    @Test
    void registeringWithAnEmailAllowsLoginByEmailToo() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Mehmet","username":"mehmet","email":"mehmet@example.com","password":"StrongPass123","code":"test-join-code"}
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
                                {"name":"Kisa","username":"kisa","password":"short","code":"test-join-code"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anInvalidUsernameIsRejected() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bosluklu","username":"ad soyad","password":"StrongPass123","code":"test-join-code"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void registrationWithoutTheCompanyCodeIsRefused() throws Exception {
        // Registration auto-approves, so whoever gets through this lands in the staff directory
        // with everyone's name, e-mail and phone, and in the company chat. The code is the door.
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Davetsiz Misafir","username":"davetsiz","password":"StrongPass123"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void registrationWithTheWrongCodeIsRefused() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Yanlis Kod","username":"yanliskod","password":"StrongPass123",
                                 "code":"tahmin-edilen-kod"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void aRefusedRegistrationLeavesNoAccountBehind() throws Exception {
        mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Yarim Kayit","username":"yarimkayit","password":"StrongPass123"}
                                """))
                .andExpect(status().isForbidden());

        // Checked from the outside: a half-created account that cannot log in but holds the
        // username would lock the real colleague out of the name they wanted.
        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"yarimkayit","password":"StrongPass123"}
                                """))
                .andExpect(status().isUnauthorized());
    }
}
