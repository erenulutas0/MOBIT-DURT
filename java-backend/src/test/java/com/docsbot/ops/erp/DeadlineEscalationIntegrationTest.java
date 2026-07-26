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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

    @Test
    void newerDeadlineAlertSupersedesTheTasksEarlierUnreadOnes() throws Exception {
        String adminToken = loginAdmin();
        String register = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Termin Calisan","username":"termin","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(register, "$.user_id")).longValue();

        String task = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Site yapma","assignee_user_ids":[%d],"priority":"high",
                                 "deadline_at":"%s"}
                                """.formatted(userId, Instant.now().plus(30, ChronoUnit.MINUTES))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(task, "$.id")).longValue();

        // Due-soon fires first (deadline within the 1h threshold): one unread alert for the user.
        deadlineService.processDueSoonTasks();
        Assertions.assertEquals(1, unreadDeadlineAlerts(userId));

        // Deadline slides into the past → the task goes overdue. The new overdue alert must
        // supersede the now-obsolete "termini yaklaşıyor" so the bell shows ONE live alert, not two.
        jdbcTemplate.update(
                "update erp_tasks set deadline_at=? where id=?",
                java.sql.Timestamp.from(Instant.now().minus(2, ChronoUnit.HOURS)),
                taskId);
        deadlineService.processOverdueTasks();

        Assertions.assertEquals(1, unreadDeadlineAlerts(userId), "only the newest alert stays unread");
        Integer deadlineRows = jdbcTemplate.queryForObject(
                """
                select count(*) from erp_notifications
                 where task_id=? and user_id=?
                   and type in ('task_due_soon','task_overdue','task_overdue_nudge')
                """,
                Integer.class, taskId, userId);
        Assertions.assertEquals(2, deadlineRows, "history is preserved — the old one is read, not deleted");
    }

    // A settled task will never get a newer alert, so the per-task supersede can never clear its
    // outstanding ones — they would sit unread in the bell forever ("yapışık kalmış").
    @Test
    void cancellingATaskRetiresItsOutstandingDeadlineAlerts() throws Exception {
        String adminToken = loginAdmin();
        String register = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Iptal Calisan","username":"iptalci","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(register, "$.user_id")).longValue();

        String task = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Iptal edilecek is","assignee_user_ids":[%d],"priority":"high",
                                 "deadline_at":"%s"}
                                """.formatted(userId, Instant.now().plus(30, ChronoUnit.MINUTES))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(task, "$.id")).longValue();

        deadlineService.processDueSoonTasks();
        Assertions.assertEquals(1, unreadDeadlineAlerts(userId));

        mockMvc.perform(patch("/erp/tasks/" + taskId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"cancelled\"}"))
                .andExpect(status().isOk());

        Assertions.assertEquals(0, unreadDeadlineAlerts(userId),
                "a cancelled task must not keep its deadline alert lit");
    }

    // The admin used to be exempt from preference checks entirely, so the notification settings
    // screen was a no-op for them: toggles saved, showed as off, and every category kept arriving.
    @Test
    void adminDeadlineAlertsRespectTheirNotificationPreference() throws Exception {
        String adminToken = loginAdmin();
        String register = mockMvc.perform(post("/erp/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Tercih Calisan","username":"tercihci","password":"StrongPass123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(register, "$.user_id")).longValue();

        mockMvc.perform(patch("/erp/notification-preferences")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deadline_alerts_enabled\":false}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Sessiz olmali","assignee_user_ids":[%d],"priority":"high",
                                 "deadline_at":"%s"}
                                """.formatted(userId, Instant.now().plus(30, ChronoUnit.MINUTES))))
                .andExpect(status().isOk());

        deadlineService.processDueSoonTasks();

        Integer adminAlerts = jdbcTemplate.queryForObject(
                """
                select count(*) from erp_notifications
                 where user_id = 0 and type = 'manager_due_soon_digest'
                """,
                Integer.class);
        Assertions.assertEquals(0, adminAlerts, "admin turned deadline alerts off");
        // The assignee never changed their preference, so they must still be warned.
        Assertions.assertEquals(1, unreadDeadlineAlerts(userId));
    }

    private int unreadDeadlineAlerts(long userId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                select count(*) from erp_notifications
                 where user_id=? and read_at is null
                   and type in ('task_due_soon','task_overdue','task_overdue_nudge')
                """,
                Integer.class, userId);
        return count == null ? 0 : count;
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
