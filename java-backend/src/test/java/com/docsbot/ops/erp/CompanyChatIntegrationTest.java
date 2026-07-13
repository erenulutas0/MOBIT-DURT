package com.docsbot.ops.erp;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.application.CompanyChatService;
import com.docsbot.ops.erp.infrastructure.ErpCompanyChatMessageRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class CompanyChatIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpCompanyChatMessageRepository messageRepository;

    @Autowired
    private CompanyChatService companyChatService;

    @Autowired
    private ErpAccountRequestRepository accountRequestRepository;

    @Autowired
    private ErpUserRepository userRepository;

    @BeforeEach
    void cleanDatabase() {
        messageRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void adminAndEmployeeSeeTheSameSharedFeedWithRoleTags() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Kaan Chat", "kaan.chat@example.com");

        mockMvc.perform(post("/erp/company-chat/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Herkese gunaydin.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_role").value("admin"))
                .andExpect(jsonPath("$.author_name").value("Admin"));

        mockMvc.perform(post("/erp/company-chat/messages")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Gunaydin!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_role").value("employee"))
                .andExpect(jsonPath("$.author_name").value("Kaan Chat"));

        // Both roles see the identical shared feed, in order.
        String adminFeed = mockMvc.perform(get("/erp/company-chat/messages")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        String employeeFeed = mockMvc.perform(get("/erp/company-chat/messages")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(adminFeed).isEqualTo(employeeFeed);
    }

    @Test
    void dailyPurgeHardDeletesTheWholeChannel() throws Exception {
        String adminToken = loginAdmin();
        mockMvc.perform(post("/erp/company-chat/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Silinecek mesaj.\"}"))
                .andExpect(status().isOk());
        assertThat(messageRepository.count()).isEqualTo(1);

        companyChatService.purgeDaily();

        assertThat(messageRepository.count()).isZero();
        mockMvc.perform(get("/erp/company-chat/messages")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private Employee createApprovedEmployee(String adminToken, String name, String email) throws Exception {
        String requestBody = """
                {"name":"%s","email":"%s","password":"StrongPass123!"}
                """.formatted(name, email);
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(requestResponse, "$.id")).longValue();

        String approvalResponse = mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(approvalResponse, "$.id")).longValue();

        String loginResponse = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123!"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Employee(userId, JsonPath.read(loginResponse, "$.access_token"));
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Employee(long id, String token) {
    }
}
