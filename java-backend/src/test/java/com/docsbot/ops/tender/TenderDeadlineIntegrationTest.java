package com.docsbot.ops.tender;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Assertions;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class TenderDeadlineIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TenderDeadlineService tenderDeadlineService;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE tenders CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_notifications CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_users CASCADE");
    }

    @Test
    void adminSetsDeadlineAndReminderFiresOncePerStage() throws Exception {
        String adminToken = loginAdmin();
        String created = mockMvc.perform(post("/tenders/company")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organization\":\"BEDAŞ\",\"year\":2026}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String tenderId = JsonPath.read(created, "$.tender_id");

        // Employees cannot set tender deadlines.
        String employeeToken = register();
        mockMvc.perform(patch("/tenders/{id}/deadline", tenderId)
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"submission_deadline_at\":\"" + Instant.now().plus(2, ChronoUnit.HOURS) + "\"}"))
                .andExpect(status().isForbidden());

        // Admin sets it 2h out → inside the 4h stage.
        mockMvc.perform(patch("/tenders/{id}/deadline", tenderId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"submission_deadline_at\":\"" + Instant.now().plus(2, ChronoUnit.HOURS) + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submission_deadline_at").isNotEmpty());

        Assertions.assertEquals(1, tenderDeadlineService.processTenderDeadlines());
        Integer alerts = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type='tender_deadline_soon'", Integer.class);
        Assertions.assertEquals(1, alerts);

        // Same stage does not fire twice.
        Assertions.assertEquals(0, tenderDeadlineService.processTenderDeadlines());

        // Once the deadline passes, a single CRITICAL alert fires.
        jdbcTemplate.update("update tenders set submission_deadline_at=? where tender_id=?",
                java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)), tenderId);
        Assertions.assertEquals(1, tenderDeadlineService.processTenderDeadlines());
        Assertions.assertEquals(0, tenderDeadlineService.processTenderDeadlines());
    }

    private String register() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ihale Calisani","username":"ihaleci","password":"StrongPass123","code":"test-join-code"}
                                """))
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
