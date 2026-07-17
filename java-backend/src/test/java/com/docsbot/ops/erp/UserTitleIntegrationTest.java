package com.docsbot.ops.erp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class UserTitleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE erp_users CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_account_requests CASCADE");
    }

    @Test
    void adminAssignsAndClearsTitlesEmployeesCannot() throws Exception {
        String adminToken = loginAdmin();
        String employeeToken = register("unvanli");
        long userId = userIdOf(adminToken, "Unvanli Kullanici");

        // Registration leaves the title empty.
        mockMvc.perform(get("/erp/users").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").isEmpty());

        // Admin assigns a title.
        mockMvc.perform(patch("/erp/users/{id}/title", userId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Saha Muhendisi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Saha Muhendisi"));

        // Employees cannot manage titles.
        mockMvc.perform(patch("/erp/users/{id}/title", userId)
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"CEO\"}"))
                .andExpect(status().isForbidden());

        // Blank clears it.
        mockMvc.perform(patch("/erp/users/{id}/title", userId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").isEmpty());
    }

    @Test
    void approvingAnAccountRequestCanAssignTheTitle() throws Exception {
        String adminToken = loginAdmin();
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Onayli Calisan","email":"onayli@example.com","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(requestResponse, "$.id")).longValue();

        mockMvc.perform(post("/erp/account-requests/{id}/approve", requestId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Muhasebe Uzmani\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/erp/users").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name=='Onayli Calisan')].title").value("Muhasebe Uzmani"));
    }

    private long userIdOf(String adminToken, String name) throws Exception {
        java.util.List<Number> ids = JsonPath.read(
                mockMvc.perform(get("/erp/users").header("Authorization", bearer(adminToken)))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$[?(@.name=='" + name + "')].id");
        return ids.get(0).longValue();
    }

    private String register(String username) throws Exception {
        String response = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Unvanli Kullanici","username":"%s","password":"StrongPass123"}
                                """.formatted(username)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
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
}
