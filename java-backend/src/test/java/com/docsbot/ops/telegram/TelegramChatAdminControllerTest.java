package com.docsbot.ops.telegram;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class TelegramChatAdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("delete from telegram_chat_bindings");
        jdbcTemplate.update("delete from telegram_chat_setups");
        jdbcTemplate.update("delete from erp_account_requests");
        // Messages before users: SET NULL sender FKs would violate the sender check constraints.
        jdbcTemplate.update("delete from erp_direct_messages");
        jdbcTemplate.update("delete from company_chat_messages");
        jdbcTemplate.update("delete from erp_users");
    }

    @Test
    void adminCanManageTelegramChatSetupAndBinding() throws Exception {
        String adminToken = loginAdmin();

        mockMvc.perform(put("/telegram/chats/-100123/setup")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "chatTitle":"BEDAS İhale Grubu",
                                  "internalUnit":"MOBIT"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chatId").value("-100123"))
                .andExpect(jsonPath("$.chatTitle").value("BEDAS İhale Grubu"))
                .andExpect(jsonPath("$.internalUnit").value("MOBIT"));

        mockMvc.perform(put("/telegram/chats/-100123/binding")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "tenderId":"BEDAS-2026-20260623-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chatId").value("-100123"))
                .andExpect(jsonPath("$.tenderId").value("BEDAS-2026-20260623-001"));

        mockMvc.perform(get("/telegram/chats")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].chatId").value("-100123"))
                .andExpect(jsonPath("$[0].internalUnit").value("MOBIT"))
                .andExpect(jsonPath("$[0].tenderId").value("BEDAS-2026-20260623-001"));

        mockMvc.perform(delete("/telegram/chats/-100123/binding")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/telegram/chats")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tenderId").doesNotExist());
    }

    @Test
    void telegramChatAdminApiRequiresAdminRole() throws Exception {
        mockMvc.perform(get("/telegram/chats"))
                .andExpect(status().isUnauthorized());

        String employeeToken = loginEmployee("employee@example.com", loginAdmin());
        mockMvc.perform(get("/telegram/chats")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }

    private String loginEmployee(String email, String adminToken) throws Exception {
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Employee",
                                  "email":"%s",
                                  "password":"user123456"
                                }
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number requestId = JsonPath.read(requestResponse, "$.id");
        mockMvc.perform(post("/erp/account-requests/%d/approve".formatted(requestId.longValue()))
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk());
        String response = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"user123456"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
