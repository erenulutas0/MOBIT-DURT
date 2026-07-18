package com.docsbot.ops.erp;

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

import com.docsbot.ops.erp.application.DeadlineService;
import com.jayway.jsonpath.JsonPath;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class DeadlineEscalationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DeadlineService deadlineService;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE erp_tasks CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_notifications CASCADE");
        jdbcTemplate.execute("TRUNCATE TABLE erp_users CASCADE");
    }

    @Test
    void staleOverdueTasksEscalateOncePerStage() throws Exception {
        String adminToken = loginAdmin();
        String register = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Gecikmis Calisan","username":"gecikmis","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(register, "$.user_id")).longValue();

        String task = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Sahipsiz is","assignee_user_ids":[%d],"priority":"high",
                                 "deadline_at":"%s"}
                                """.formatted(userId, Instant.now().plus(1, ChronoUnit.HOURS))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(task, "$.id")).longValue();

        // Deadline slid 5 hours into the past → overdue mark fires, then the 4h escalation stage.
        jdbcTemplate.update(
                "update erp_tasks set deadline_at=? where id=?",
                java.sql.Timestamp.from(Instant.now().minus(5, ChronoUnit.HOURS)),
                taskId);
        deadlineService.processOverdueTasks();
        int escalated = deadlineService.processOverdueEscalations();
        Assertions.assertEquals(1, escalated);

        Integer nudges = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type='task_overdue_nudge' and user_id=?",
                Integer.class, userId);
        Integer adminAlerts = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type='manager_overdue_escalation'",
                Integer.class);
        Assertions.assertEquals(1, nudges);
        Assertions.assertEquals(1, adminAlerts);

        // Same stage must not fire twice.
        Assertions.assertEquals(0, deadlineService.processOverdueEscalations());
        Integer nudgesAfter = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type='task_overdue_nudge' and user_id=?",
                Integer.class, userId);
        Assertions.assertEquals(1, nudgesAfter);
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
