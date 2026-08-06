package com.docsbot.ops.erp;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class PerformanceIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE erp_tasks CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_users CASCADE");
    }

    @Test
    void performanceIsAdminOnlyAndScoresOnTimeLateAndOverdueWork() throws Exception {
        String adminToken = loginAdmin();
        String employeeToken = register("puanli", "PerfPass1234");
        java.util.List<Number> matchedIds = JsonPath.read(
                mockMvc.perform(get("/erp/users").header("Authorization", bearer(adminToken)))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$[?(@.name=='Puanli Kullanici')].id");
        long userId = matchedIds.get(0).longValue();

        Instant now = Instant.now();
        long onTimeTask = createTask(adminToken, "Zamaninda is", userId, now.plus(2, ChronoUnit.HOURS));
        long lateTask = createTask(adminToken, "Gec is", userId, now.plus(2, ChronoUnit.HOURS));
        long overdueTask = createTask(adminToken, "Gecikmis is", userId, now.plus(2, ChronoUnit.HOURS));

        // Shape history directly: one finished before its deadline, one after, one still open past it.
        jdbcTemplate.update(
                "update erp_tasks set status='DONE', completed_at=?, deadline_at=? where id=?",
                java.sql.Timestamp.from(now.minus(2, ChronoUnit.HOURS)),
                java.sql.Timestamp.from(now.minus(1, ChronoUnit.HOURS)),
                onTimeTask);
        jdbcTemplate.update(
                "update erp_tasks set status='DONE', completed_at=?, deadline_at=? where id=?",
                java.sql.Timestamp.from(now.minus(1, ChronoUnit.HOURS)),
                java.sql.Timestamp.from(now.minus(3, ChronoUnit.HOURS)),
                lateTask);
        jdbcTemplate.update(
                "update erp_tasks set deadline_at=? where id=?",
                java.sql.Timestamp.from(now.minus(4, ChronoUnit.HOURS)),
                overdueTask);

        // Employees cannot see anyone's score.
        mockMvc.perform(get("/erp/performance").header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        // Admin sees the tallies and the derived score: 100*(1 + 0.5)/3 = 50.
        mockMvc.perform(get("/erp/performance?period=week").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].user_id").value(userId))
                .andExpect(jsonPath("$[0].on_time").value(1))
                .andExpect(jsonPath("$[0].late").value(1))
                .andExpect(jsonPath("$[0].overdue_open").value(1))
                .andExpect(jsonPath("$[0].score").value(50));
    }

    private long createTask(String adminToken, String title, long assigneeId, Instant deadlineAt) throws Exception {
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"%s",
                                  "assignee_user_ids":[%d],
                                  "priority":"normal",
                                  "deadline_at":"%s"
                                }
                                """.formatted(title, assigneeId, deadlineAt)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private String register(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Puanli Kullanici","username":"%s","password":"%s","code":"test-join-code"}
                                """.formatted(username, password)))
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
