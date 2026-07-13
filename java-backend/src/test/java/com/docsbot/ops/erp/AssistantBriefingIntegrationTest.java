package com.docsbot.ops.erp;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.application.AssistantService;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskCommentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskDependencyRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class AssistantBriefingIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AssistantService assistantService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ErpTaskRepository taskRepository;

    @Autowired
    private ErpTaskAssignmentRepository assignmentRepository;

    @Autowired
    private ErpTaskCommentRepository commentRepository;

    @Autowired
    private ErpTaskDependencyRepository dependencyRepository;

    @Autowired
    private ErpNotificationRepository notificationRepository;

    @Autowired
    private ErpNotificationPreferenceRepository notificationPreferenceRepository;

    @Autowired
    private ErpNotificationDeliveryRepository notificationDeliveryRepository;

    @Autowired
    private ErpActivityEventRepository activityRepository;

    @Autowired
    private ErpDirectMessageRepository directMessageRepository;

    @Autowired
    private ErpAccountRequestRepository accountRequestRepository;

    @Autowired
    private ErpUserRepository userRepository;

    @BeforeEach
    void cleanDatabase() {
        activityRepository.deleteAll();
        notificationDeliveryRepository.deleteAll();
        notificationRepository.deleteAll();
        notificationPreferenceRepository.deleteAll();
        commentRepository.deleteAll();
        dependencyRepository.deleteAll();
        assignmentRepository.deleteAll();
        taskRepository.deleteAll();
        directMessageRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void briefingGroupsTasksIntoSectionsAndCountsUnreadMessages() throws Exception {
        String adminToken = loginAdmin();
        Employee aylin = createApprovedEmployee(adminToken, "Aylin Asistan", "aylin.asistan@example.com");

        // Overdue: created with a future deadline, then backdated straight in the DB.
        long overdueId = createTask(adminToken, "Geciken is", aylin.id(), Instant.now().plus(1, ChronoUnit.HOURS));
        jdbcTemplate.update(
                "update erp_tasks set deadline_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minus(2, ChronoUnit.DAYS)),
                overdueId);

        // Due within minutes -> "today"; due in 3 days -> "this week".
        long dueTodayId = createTask(adminToken, "Bugun teslim", aylin.id(), Instant.now().plus(5, ChronoUnit.MINUTES));
        long dueWeekId = createTask(adminToken, "Hafta ici teslim", aylin.id(), Instant.now().plus(3, ChronoUnit.DAYS));

        // Dependency pair: successor starts blocked, becomes ready when the predecessor is done.
        long predecessorId = createTask(adminToken, "On kosul", aylin.id(), null);
        long successorId = createTask(adminToken, "Bagimli is", aylin.id(), null);
        mockMvc.perform(post("/erp/tasks/{taskId}/dependencies", successorId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"predecessor_task_id\":%d}".formatted(predecessorId)))
                .andExpect(status().isOk());

        // One unread direct message from the admin.
        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient_user_id\":%d,\"body\":\"Bugun toplanti var\"}".formatted(aylin.id())))
                .andExpect(status().isOk());

        mockMvc.perform(get("/erp/assistant/briefing")
                        .header("Authorization", bearer(aylin.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assistant_name").value("Mobit-Asistan"))
                .andExpect(jsonPath("$.overdue[0].id").value(overdueId))
                .andExpect(jsonPath("$.due_today[0].id").value(dueTodayId))
                .andExpect(jsonPath("$.due_this_week[0].id").value(dueWeekId))
                .andExpect(jsonPath("$.blocked[0].id").value(successorId))
                .andExpect(jsonPath("$.ready_to_start").isEmpty())
                .andExpect(jsonPath("$.unread_messages").value(1));

        // Completing the predecessor (employee requests, admin approves) moves the successor
        // from blocked to ready-to-start.
        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", predecessorId)
                        .header("Authorization", bearer(aylin.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", predecessorId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/erp/assistant/briefing")
                        .header("Authorization", bearer(aylin.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").isEmpty())
                .andExpect(jsonPath("$.ready_to_start[0].id").value(successorId));

        // Admin sees the whole board.
        mockMvc.perform(get("/erp/assistant/briefing")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdue[0].id").value(overdueId));
    }

    @Test
    void chatAnswersFromRetrievedBriefingWithoutAnLlm() throws Exception {
        String adminToken = loginAdmin();
        Employee cem = createApprovedEmployee(adminToken, "Cem Sohbet", "cem.sohbet@example.com");

        long overdueId = createTask(adminToken, "Vergi beyani", cem.id(), Instant.now().plus(1, ChronoUnit.HOURS));
        jdbcTemplate.update(
                "update erp_tasks set deadline_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minus(2, ChronoUnit.DAYS)),
                overdueId);

        // "overdue" intent -> lists the overdue task, served by the zero-cost rule-based provider.
        mockMvc.perform(post("/erp/assistant/chat")
                        .header("Authorization", bearer(cem.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"geciken görevlerim neler?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provider").value("rule-based"))
                .andExpect(jsonPath("$.assistant_name").value("Mobit-Asistan"))
                .andExpect(jsonPath("$.reply", containsString("Vergi beyani")));

        // Title keyword search finds a task by name.
        mockMvc.perform(post("/erp/assistant/chat")
                        .header("Authorization", bearer(cem.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"vergi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply", containsString("Vergi beyani")));

        // Blank message is rejected by validation.
        mockMvc.perform(post("/erp/assistant/chat")
                        .header("Authorization", bearer(cem.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void morningBriefingNotifiesOncePerUserPerDay() throws Exception {
        String adminToken = loginAdmin();
        Employee burak = createApprovedEmployee(adminToken, "Burak Sabah", "burak.sabah@example.com");
        createTask(adminToken, "Sabah gorevi", burak.id(), Instant.now().plus(10, ChronoUnit.MINUTES));

        int first = assistantService.sendMorningBriefings();
        assertThat(first).isGreaterThanOrEqualTo(1);

        // Same day, second run: the per-day event key dedupes everything.
        int second = assistantService.sendMorningBriefings();
        assertThat(second).isZero();

        assertThat(notificationRepository.findAll())
                .anySatisfy(notification -> {
                    assertThat(notification.getType()).isEqualTo("assistant_briefing");
                    assertThat(notification.getTitle()).contains("Mobit-Asistan").contains("Burak");
                });
    }

    private long createTask(String adminToken, String title, long assigneeUserId, Instant deadlineAt) throws Exception {
        String deadlineField = deadlineAt == null ? "" : ",\"deadline_at\":\"" + deadlineAt + "\"";
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"%s","assignee_user_ids":[%d]%s}
                                """.formatted(title, assigneeUserId, deadlineField)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private Employee createApprovedEmployee(String adminToken, String name, String email) throws Exception {
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","email":"%s","password":"StrongPass123!"}
                                """.formatted(name, email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(requestResponse, "$.id")).longValue();

        String approval = mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(approval, "$.id")).longValue();

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
