package com.docsbot.ops.erp;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.application.DeadlineService;
import com.docsbot.ops.erp.application.WorkflowSlaEscalationService;
import com.docsbot.ops.erp.application.WorkflowTemplateService;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;
import com.docsbot.ops.erp.infrastructure.ErpPushSubscriptionRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskCommentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskDocumentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;
import com.docsbot.ops.erp.infrastructure.ErpWorkflowTemplateAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpWorkflowTemplateRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;

@SpringBootTest(properties = {
        "docsbot.sla-blocked-after-ms=0",
        "docsbot.sla-approval-after-ms=0",
        "docsbot.email.enabled=true",
        "docsbot.email.dry-run=true",
        "docsbot.email.from=docsbot@example.test",
        "docsbot.email.admin-to=admin@example.test",
        "docsbot.workflow-template-initial-delay-ms=3600000"
})
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class ErpDomainIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpTaskAssignmentRepository assignmentRepository;

    @Autowired
    private ErpTaskCommentRepository commentRepository;

    @Autowired
    private ErpTaskDocumentRepository documentRepository;

    @Autowired
    private ErpNotificationRepository notificationRepository;

    @Autowired
    private ErpNotificationPreferenceRepository notificationPreferenceRepository;

    @Autowired
    private ErpNotificationDeliveryRepository notificationDeliveryRepository;

    @Autowired
    private ErpPushSubscriptionRepository pushSubscriptionRepository;

    @Autowired
    private DeadlineService deadlineService;

    @Autowired
    private WorkflowSlaEscalationService workflowSlaEscalationService;

    @Autowired
    private ErpTaskRepository taskRepository;

    @Autowired
    private ErpTeamMemberRepository teamMemberRepository;

    @Autowired
    private ErpTeamRepository teamRepository;

    @Autowired
    private ErpAccountRequestRepository accountRequestRepository;

    @Autowired
    private ErpUserRepository userRepository;

    @Autowired
    private ErpActivityEventRepository activityRepository;

    @Autowired
    private ErpDirectMessageRepository directMessageRepository;

    @Autowired
    private ErpWorkflowTemplateRepository workflowTemplateRepository;

    @Autowired
    private ErpWorkflowTemplateAssignmentRepository workflowTemplateAssignmentRepository;

    @Autowired
    private WorkflowTemplateService workflowTemplateService;

    @BeforeEach
    void cleanDatabase() {
        activityRepository.deleteAll();
        directMessageRepository.deleteAll();
        documentRepository.deleteAll();
        pushSubscriptionRepository.deleteAll();
        notificationDeliveryRepository.deleteAll();
        notificationRepository.deleteAll();
        notificationPreferenceRepository.deleteAll();
        commentRepository.deleteAll();
        assignmentRepository.deleteAll();
        taskRepository.deleteAll();
        workflowTemplateAssignmentRepository.deleteAll();
        workflowTemplateRepository.deleteAll();
        teamMemberRepository.deleteAll();
        teamRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
        deleteTestFiles();
    }

    @Test
    void assignedEmployeeSeesAndStartsTaskButCannotCloseIt() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Ayse Demir", "ayse.erp@example.com");
        Employee other = createApprovedEmployee(adminToken, "Can Yilmaz", "can.erp@example.com");

        long taskId = createTask(adminToken, employee.id());

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.tasks.length()").value(1))
                .andExpect(jsonPath("$.assignments[0].assignee_user_id").value(employee.id()));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(other.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(0))
                .andExpect(jsonPath("$.assignments.length()").value(0));

        mockMvc.perform(patch("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("in_progress"))
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(patch("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"done\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(other.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"done\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Completion must use the employee request and admin approval workflow"));
    }

    @Test
    void userCanRegisterAndRemoveWebPushSubscription() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Push User", "push.erp@example.com");

        mockMvc.perform(get("/erp/web-push/vapid-public-key")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        mockMvc.perform(post("/erp/web-push/subscriptions")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "endpoint":"https://push.example.test/subscription/1",
                                  "keys":{
                                    "p256dh":"public-key",
                                    "auth":"auth-secret"
                                  },
                                  "user_agent":"JUnit"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value(employee.id()))
                .andExpect(jsonPath("$.endpoint").value("https://push.example.test/subscription/1"))
                .andExpect(jsonPath("$.active").value(true));

        org.junit.jupiter.api.Assertions.assertEquals(
                1,
                pushSubscriptionRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(employee.id()).size());

        mockMvc.perform(delete("/erp/web-push/subscriptions")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"endpoint":"https://push.example.test/subscription/1"}
                                """))
                .andExpect(status().isNoContent());

        org.junit.jupiter.api.Assertions.assertEquals(
                0,
                pushSubscriptionRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(employee.id()).size());
    }

    @Test
    void emailFallbackWritesDeliveryAuditWhenPreferenceIsEnabled() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Email User", "email.erp@example.com");

        mockMvc.perform(patch("/erp/notification-preferences")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email_enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email_enabled").value(true));

        createTask(adminToken, employee.id());

        org.assertj.core.api.Assertions.assertThat(
                        notificationDeliveryRepository.findAllByChannelOrderByCreatedAtDescIdDesc("EMAIL"))
                .anySatisfy(delivery -> {
                    org.assertj.core.api.Assertions.assertThat(delivery.getStatus()).isEqualTo("ACCEPTED");
                    org.assertj.core.api.Assertions.assertThat(delivery.getErrorMessage()).isNull();
                });
    }

    @Test
    void presenceIsSelfScopedAndAdminCanManageUsers() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Murat Kaya", "murat.erp@example.com");
        Employee other = createApprovedEmployee(adminToken, "Selin Yilmaz", "selin.erp@example.com");

        mockMvc.perform(post("/erp/users/{userId}/presence", employee.id())
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"away\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("away"))
                .andExpect(jsonPath("$.last_seen_at").isNotEmpty());

        mockMvc.perform(post("/erp/users/{userId}/presence", other.id())
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"offline\"}"))
                .andExpect(status().isForbidden());

        String created = mockMvc.perform(post("/erp/users")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Temporary Manager",
                                  "role":"manager",
                                  "email":"manager@example.com",
                                  "phone":"+905551234567"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("manager"))
                .andReturn().getResponse().getContentAsString();
        long createdId = ((Number) JsonPath.read(created, "$.id")).longValue();

        mockMvc.perform(delete("/erp/users/{userId}", createdId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/erp/users")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %s)]".formatted(createdId)).isEmpty());
    }

    @Test
    void taskCreationValidatesAssigneesAndDeduplicatesTargets() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Emre Celik", "emre.erp@example.com");

        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Invalid assignment",
                                  "assignee_user_ids":[999999],
                                  "priority":"normal"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "One or more assignee users do not exist"));

        long taskId = createTaskWithDuplicateAssignee(adminToken, employee.id());
        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[?(@.id == %s)]".formatted(taskId)).isNotEmpty())
                .andExpect(jsonPath("$.assignments.length()").value(1));
    }

    @Test
    void adminCanBulkUpdateTaskStatusAndBulkAddAssignees() throws Exception {
        String adminToken = loginAdmin();
        Employee first = createApprovedEmployee(adminToken, "Bulk First", "bulk.first@example.com");
        Employee second = createApprovedEmployee(adminToken, "Bulk Second", "bulk.second@example.com");
        long firstTaskId = createTask(adminToken, first.id());
        long secondTaskId = createTask(adminToken, first.id());

        mockMvc.perform(patch("/erp/tasks/bulk/status")
                        .header("Authorization", bearer(first.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "task_ids":[%d,%d],
                                  "status":"in_progress"
                                }
                                """.formatted(firstTaskId, secondTaskId)))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/erp/tasks/bulk/status")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "task_ids":[%d,%d],
                                  "status":"in_progress"
                                }
                                """.formatted(firstTaskId, secondTaskId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("in_progress"))
                .andExpect(jsonPath("$[1].status").value("in_progress"));

        mockMvc.perform(patch("/erp/tasks/bulk/status")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "task_ids":[%d,%d],
                                  "status":"done"
                                }
                                """.formatted(firstTaskId, secondTaskId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Completion must use the employee request and admin approval workflow"));

        mockMvc.perform(post("/erp/tasks/bulk/assignees")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "task_ids":[%d,%d],
                                  "assignee_user_ids":[%d,%d]
                                }
                                """.formatted(firstTaskId, secondTaskId, first.id(), second.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignments.length()").value(4))
                .andExpect(jsonPath("$.assignments[?(@.task_id == %d && @.assignee_user_id == %d)]"
                        .formatted(firstTaskId, second.id())).isNotEmpty())
                .andExpect(jsonPath("$.assignments[?(@.task_id == %d && @.assignee_user_id == %d)]"
                        .formatted(secondTaskId, second.id())).isNotEmpty());

        mockMvc.perform(get("/erp/activity")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_STATUS_CHANGED' && @.details =~ /.*bulk=true.*/)]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_ASSIGNEE_ADDED' && @.details =~ /.*bulk=true.*/)]").isNotEmpty());
    }

    @Test
    void adminReadsErpAnalyticsSummary() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Analytics User", "analytics.erp@example.com");
        createTask(adminToken, employee.id());

        mockMvc.perform(get("/erp/analytics/summary")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/erp/analytics/summary")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users_total").value(1))
                .andExpect(jsonPath("$.tasks_total").value(1))
                .andExpect(jsonPath("$.tasks_by_status[?(@.key == 'todo')].count")
                        .value(hasItem(1)))
                .andExpect(jsonPath("$.tasks_by_priority[?(@.key == 'high')].count")
                        .value(hasItem(1)))
                .andExpect(jsonPath("$.unassigned_tasks").value(0))
                .andExpect(jsonPath("$.completion_rate").value(0.0));
    }

    @Test
    void adminReadsErpActivityEventsForCoreMutations() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Activity User", "activity.erp@example.com");
        long taskId = createTask(adminToken, employee.id());

        mockMvc.perform(patch("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Ready for approval.\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", taskId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/erp/activity")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/erp/activity")
                        .queryParam("offset", "0")
                        .queryParam("limit", "20")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(activityRepository.count()))
                .andExpect(jsonPath("$.items[?(@.event_type == 'ACCOUNT_REQUEST_CREATED')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'ACCOUNT_REQUEST_APPROVED')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_CREATED' && @.task_id == %s)]"
                        .formatted(taskId)).isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_ASSIGNEE_ADDED' && @.details == 'assignee_user_id=%s')]"
                        .formatted(employee.id())).isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_STATUS_CHANGED' && @.actor_user_id == %s)]"
                        .formatted(employee.id())).isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_COMPLETION_REQUESTED')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_COMPLETION_APPROVED')]").isNotEmpty());
    }

    @Test
    void erpListPagesRespectRoleVisibility() throws Exception {
        String adminToken = loginAdmin();
        Employee first = createApprovedEmployee(adminToken, "Page First", "page.first@example.com");
        Employee second = createApprovedEmployee(adminToken, "Page Second", "page.second@example.com");
        long firstTaskId = createTask(adminToken, first.id());
        createTask(adminToken, second.id());

        mockMvc.perform(get("/erp/users/page")
                        .queryParam("offset", "0")
                        .queryParam("limit", "1")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(2))
                .andExpect(jsonPath("$.page.has_next").value(true))
                .andExpect(jsonPath("$.items.length()").value(1));

        mockMvc.perform(get("/erp/tasks/page")
                        .queryParam("offset", "0")
                        .queryParam("limit", "1")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(2))
                .andExpect(jsonPath("$.page.has_next").value(true))
                .andExpect(jsonPath("$.items.length()").value(1));

        mockMvc.perform(get("/erp/users/page")
                        .header("Authorization", bearer(first.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(2))
                .andExpect(jsonPath("$.items[0].id").value(first.id()));

        mockMvc.perform(get("/erp/tasks/page")
                        .header("Authorization", bearer(first.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(firstTaskId));
    }

    @Test
    void teamMembershipScopesTeamTasksAndTaskDetails() throws Exception {
        String adminToken = loginAdmin();
        Employee member = createApprovedEmployee(adminToken, "Selin Kaya", "selin.team@example.com");
        Employee outsider = createApprovedEmployee(adminToken, "Mert Kaya", "mert.team@example.com");

        String teamResponse = mockMvc.perform(post("/erp/teams")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Tender Operations\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Tender Operations"))
                .andReturn().getResponse().getContentAsString();
        long teamId = ((Number) JsonPath.read(teamResponse, "$.id")).longValue();

        mockMvc.perform(post("/erp/teams/{teamId}/members/{userId}", teamId, member.id())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        String taskResponse = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Team assignment",
                                  "assignee_team_ids":[%d],
                                  "priority":"normal"
                                }
                                """.formatted(teamId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(taskResponse, "$.id")).longValue();

        mockMvc.perform(get("/erp/teams")
                        .header("Authorization", bearer(member.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(teamId));

        mockMvc.perform(get("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(member.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(taskId));

        mockMvc.perform(get("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/erp/teams/{teamId}/members/{userId}", teamId, member.id())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(member.token())))
                .andExpect(status().isNotFound());
    }

    @Test
    void employeeUserListShowsDirectoryAndTeamWritesRequireAdmin() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Derya Ak", "derya.scope@example.com");
        createApprovedEmployee(adminToken, "Bora Ak", "bora.scope@example.com");

        mockMvc.perform(get("/erp/users")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Bora Ak"))
                .andExpect(jsonPath("$[1].name").value("Derya Ak"));

        mockMvc.perform(post("/erp/teams")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Unauthorized Team\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void completionUsesJwtIdentityAndAdminApprovalNotifiesAssignee() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Completion Employee",
                "completion.employee@example.com");
        Employee other = createApprovedEmployee(
                adminToken,
                "Other Employee",
                "completion.other@example.com");
        long taskId = createTask(adminToken, employee.id());

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "user_id":%d,
                                  "note":"Ready for review."
                                }
                                """.formatted(other.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending_approval"));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.help_messages[0].author_user_id").value(employee.id()))
                .andExpect(jsonPath("$.help_messages[0].kind").value("completion_request"))
                .andExpect(jsonPath("$.notifications[0].user_id").value(0))
                .andExpect(jsonPath("$.notifications[0].type").value("task_completion_requested"));

        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"admin_name\":\"Spoofed Admin\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("done"))
                .andExpect(jsonPath("$.completed_at").isNotEmpty());

        String employeeNotifications = mockMvc.perform(get("/erp/notifications")
                        .queryParam("user_id", "0")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].user_id").value(employee.id()))
                .andExpect(jsonPath("$[0].type").value("task_completion_approved"))
                .andReturn().getResponse().getContentAsString();
        long notificationId =
                ((Number) JsonPath.read(employeeNotifications, "$[0].id")).longValue();

        mockMvc.perform(patch("/erp/notifications/{notificationId}/read", notificationId)
                        .header("Authorization", bearer(other.token())))
                .andExpect(status().isNotFound());

        mockMvc.perform(patch("/erp/notifications/{notificationId}/read", notificationId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read_at").isNotEmpty());
    }

    @Test
    void notificationsExposeUnreadCountAndCanBeMarkedReadInBulk() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Unread Employee",
                "unread.employee@example.com");
        createTask(adminToken, employee.id());
        org.assertj.core.api.Assertions.assertThat(notificationDeliveryRepository.count()).isEqualTo(1);

        mockMvc.perform(get("/erp/notifications/unread-count")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread_count").value(1));

        mockMvc.perform(patch("/erp/notifications/read-all")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated_count").value(1));

        mockMvc.perform(get("/erp/notifications/unread-count")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread_count").value(0));
    }

    @Test
    void notificationStreamRequiresAuthenticationAndStartsSse() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Stream Employee",
                "stream.employee@example.com");

        mockMvc.perform(get("/erp/notifications/stream"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/erp/notifications/stream")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Content-Type",
                        org.hamcrest.Matchers.startsWith(MediaType.TEXT_EVENT_STREAM_VALUE)))
                .andExpect(request().asyncStarted());
    }

    @Test
    void notificationPreferencesSuppressDisabledCategories() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Preference Employee",
                "preference.employee@example.com");

        mockMvc.perform(patch("/erp/notification-preferences")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"task_assigned_enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task_assigned_enabled").value(false));

        createTask(adminToken, employee.id());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'task_assigned')]").isEmpty());
    }

    @Test
    void rejectionReturnsTaskToWorkAndMessagesRemainTaskScoped() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Message Employee",
                "message.employee@example.com");
        Employee outsider = createApprovedEmployee(
                adminToken,
                "Message Outsider",
                "message.outsider@example.com");
        long taskId = createTask(adminToken, employee.id());

        mockMvc.perform(post("/erp/tasks/{taskId}/comments", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "author_user_id":%d,
                                  "body":"I need clarification.",
                                  "kind":"help"
                                }
                                """.formatted(outsider.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_user_id").value(employee.id()))
                .andExpect(jsonPath("$.kind").value("help"));

        mockMvc.perform(post("/erp/tasks/{taskId}/comments", taskId)
                        .header("Authorization", bearer(outsider.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"I should not see this.\",\"kind\":\"help\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/erp/tasks/{taskId}/comments", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "author_user_id":%d,
                                  "body":"Please check section four.",
                                  "kind":"help"
                                }
                """.formatted(outsider.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_user_id").value(nullValue()))
                .andExpect(jsonPath("$.kind").value("reply"));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.help_messages.length()").value(0));

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", taskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Review requested.\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/reject-completion", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Missing evidence.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("in_progress"));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.help_messages[?(@.kind == 'completion_rejected')].body")
                        .value(hasItem("Missing evidence.")))
                .andExpect(jsonPath("$.notifications[?(@.type == 'task_completion_rejected')]")
                        .isNotEmpty());
    }

    @Test
    void teamAssignedEmployeeCanRequestCompletionAndAllMembersAreNotified() throws Exception {
        String adminToken = loginAdmin();
        Employee first = createApprovedEmployee(adminToken, "Team First", "team.first@example.com");
        Employee second = createApprovedEmployee(adminToken, "Team Second", "team.second@example.com");

        String teamResponse = mockMvc.perform(post("/erp/teams")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Completion Team\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long teamId = ((Number) JsonPath.read(teamResponse, "$.id")).longValue();
        for (Employee employee : new Employee[]{first, second}) {
            mockMvc.perform(post("/erp/teams/{teamId}/members/{userId}", teamId, employee.id())
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isNoContent());
        }

        String taskResponse = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Team completion task",
                                  "assignee_team_ids":[%d]
                                }
                                """.formatted(teamId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(taskResponse, "$.id")).longValue();

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", taskId)
                        .header("Authorization", bearer(first.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Team work finished.\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        for (Employee employee : new Employee[]{first, second}) {
            mockMvc.perform(get("/erp/notifications")
                            .header("Authorization", bearer(employee.token())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].type").value("task_completion_approved"));
        }
    }

    @Test
    void assignedEmployeeUploadsAndReadsTaskDocumentWhileOutsiderIsHidden() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "File Employee", "file.employee@example.com");
        Employee outsider = createApprovedEmployee(adminToken, "File Outsider", "file.outsider@example.com");
        long taskId = createTask(adminToken, employee.id());
        byte[] fileBytes = "task document content".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "../Teknik Şartname.txt",
                "text/plain",
                fileBytes);

        String uploadResponse = mockMvc.perform(multipart("/erp/tasks/{taskId}/documents", taskId)
                        .file(file)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task_id").value(taskId))
                .andExpect(jsonPath("$.original_filename").value("Teknik Şartname.txt"))
                .andExpect(jsonPath("$.file_path").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(".."))))
                .andReturn().getResponse().getContentAsString();
        long documentId = ((Number) JsonPath.read(uploadResponse, "$.id")).longValue();

        mockMvc.perform(get("/erp/task-documents/{documentId}/content", documentId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.startsWith("inline")))
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/erp/task-documents/{documentId}/content", documentId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/erp/task-documents/{documentId}", documentId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/erp/task-documents/{documentId}", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/erp/task-documents/{documentId}/content", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    void taskDocumentUploadRejectsUnsupportedMimeType() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Mime Employee", "mime.employee@example.com");
        long taskId = createTask(adminToken, employee.id());
        MockMultipartFile executable = new MockMultipartFile(
                "file",
                "unsafe.exe",
                "application/x-msdownload",
                new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/erp/tasks/{taskId}/documents", taskId)
                        .file(executable)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unsupported file type"));
    }

    @Test
    void taskDocumentUploadRejectsSpoofedPdfContent() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Spoof Employee", "spoof.employee@example.com");
        long taskId = createTask(adminToken, employee.id());
        MockMultipartFile spoofedPdf = new MockMultipartFile(
                "file",
                "fake.pdf",
                "application/pdf",
                "this is not a pdf".getBytes(java.nio.charset.StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/erp/tasks/{taskId}/documents", taskId)
                        .file(spoofedPdf)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("File content does not match its declared type"));
    }

    @Test
    void dueSoonProcessorIsIdempotentAndNotifiesAssigneeAndAdmin() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Due Soon Employee",
                "due.soon.employee@example.com");
        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Due soon task",
                                  "assignee_user_ids":[%d],
                                  "deadline_at":"%s"
                                }
                                """.formatted(
                                employee.id(),
                                Instant.now().plusSeconds(3600))))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(deadlineService.processDueSoonTasks()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(deadlineService.processDueSoonTasks()).isZero();

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'task_due_soon')]").isNotEmpty());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'manager_due_soon_digest')]").isNotEmpty());
    }

    @Test
    void overdueProcessorIsIdempotentAndNotifiesAssigneeAndAdmin() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Deadline Employee",
                "deadline.employee@example.com");
        String taskResponse = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Expired deadline task",
                                  "assignee_user_ids":[%d],
                                  "deadline_at":"%s"
                                }
                                """.formatted(
                                employee.id(),
                                Instant.now().minusSeconds(3600))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(taskResponse, "$.id")).longValue();

        org.assertj.core.api.Assertions.assertThat(deadlineService.processOverdueTasks()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(deadlineService.processOverdueTasks()).isZero();

        mockMvc.perform(get("/erp/tasks/{taskId}", taskId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("overdue"));

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'task_overdue')]").isNotEmpty());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'manager_overdue_digest')]").isNotEmpty());
    }

    @Test
    void workflowSlaEscalatesBlockedAndApprovalPendingTasks() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "SLA Employee",
                "sla.employee@example.com");
        long blockedTaskId = createTask(adminToken, employee.id());
        long approvalTaskId = createTask(adminToken, employee.id());

        mockMvc.perform(patch("/erp/tasks/{taskId}", blockedTaskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"blocked\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", approvalTaskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Ready for SLA approval.\"}"))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(workflowSlaEscalationService.processEscalations())
                .isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(workflowSlaEscalationService.processEscalations())
                .isZero();

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'task_blocked_escalation')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.type == 'task_completion_approval_escalation')]").isNotEmpty());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'task_blocked_escalation')]").isNotEmpty());

        mockMvc.perform(get("/erp/activity")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_BLOCKED_ESCALATED' && @.task_id == %s)]"
                        .formatted(blockedTaskId)).isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'TASK_APPROVAL_ESCALATED' && @.task_id == %s)]"
                        .formatted(approvalTaskId)).isNotEmpty());
    }

    @Test
    void directMessagesWorkOutsideTaskComments() throws Exception {
        String adminToken = loginAdmin();
        Employee sender = createApprovedEmployee(
                adminToken,
                "Message Sender",
                "direct.sender@example.com");
        Employee recipient = createApprovedEmployee(
                adminToken,
                "Message Recipient",
                "direct.recipient@example.com");
        Employee outsider = createApprovedEmployee(
                adminToken,
                "Message Outsider",
                "direct.outsider@example.com");

        String employeeMessage = mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(sender.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Admin tarafindan kontrol rica ederim.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sender_type").value("user"))
                .andExpect(jsonPath("$.sender_user_id").value(sender.id()))
                .andExpect(jsonPath("$.recipient_type").value("admin"))
                .andReturn().getResponse().getContentAsString();
        long employeeMessageId = ((Number) JsonPath.read(employeeMessage, "$.id")).longValue();

        mockMvc.perform(get("/erp/messages")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(employeeMessageId));

        mockMvc.perform(get("/erp/messages")
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(patch("/erp/messages/{messageId}/read", employeeMessageId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read_at").isNotEmpty());

        String adminMessage = mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "recipient_user_id":%d,
                                  "body":"Bugunku saha notunu paylasir misin?"
                                }
                                """.formatted(recipient.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sender_type").value("admin"))
                .andExpect(jsonPath("$.recipient_user_id").value(recipient.id()))
                .andReturn().getResponse().getContentAsString();
        long adminMessageId = ((Number) JsonPath.read(adminMessage, "$.id")).longValue();

        mockMvc.perform(get("/erp/messages")
                        .header("Authorization", bearer(recipient.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(adminMessageId));

        mockMvc.perform(patch("/erp/messages/{messageId}/read", adminMessageId)
                        .header("Authorization", bearer(sender.token())))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(sender.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "recipient_user_id":%d,
                                  "body":"Kendi kendime mesaj"
                                }
                                """.formatted(sender.id())))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'direct_message')]").isNotEmpty());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(recipient.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'direct_message')]").isNotEmpty());

        mockMvc.perform(get("/erp/activity")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.event_type == 'DIRECT_MESSAGE_SENT')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'DIRECT_MESSAGE_READ')]").isNotEmpty());
    }

    @Test
    void adminCreatesAndRunsRecurringWorkflowTemplates() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(
                adminToken,
                "Recurring Employee",
                "recurring.employee@example.com");

        mockMvc.perform(get("/erp/workflow-templates")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isForbidden());

        String templateResponse = mockMvc.perform(post("/erp/workflow-templates")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Weekly field report",
                                  "task_title":"Prepare weekly field report",
                                  "task_description":"Summarize completed field operations.",
                                  "task_priority":"high",
                                  "recurrence_type":"weekly",
                                  "recurrence_interval":1,
                                  "recurrence_zone":"Europe/Istanbul",
                                  "deadline_offset_minutes":1440,
                                  "next_run_at":"2030-01-07T06:00:00Z",
                                  "assignee_user_ids":[%d]
                                }
                                """.formatted(employee.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recurrence_type").value("weekly"))
                .andExpect(jsonPath("$.assignments[0].assignee_user_id").value(employee.id()))
                .andReturn().getResponse().getContentAsString();
        long templateId = ((Number) JsonPath.read(templateResponse, "$.id")).longValue();

        String taskResponse = mockMvc.perform(post("/erp/workflow-templates/{templateId}/run", templateId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Prepare weekly field report"))
                .andExpect(jsonPath("$.priority").value("high"))
                .andExpect(jsonPath("$.workflow_template_id").value(templateId))
                .andExpect(jsonPath("$.scheduled_for").isNotEmpty())
                .andExpect(jsonPath("$.deadline_at").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        long manualTaskId = ((Number) JsonPath.read(taskResponse, "$.id")).longValue();

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].id").value(manualTaskId))
                .andExpect(jsonPath("$.assignments[0].assignee_user_id").value(employee.id()));

        mockMvc.perform(post("/erp/workflow-templates")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Daily operations check",
                                  "task_title":"Complete daily operations check",
                                  "task_priority":"normal",
                                  "recurrence_type":"daily",
                                  "recurrence_interval":1,
                                  "next_run_at":"2020-01-01T08:00:00Z",
                                  "assignee_user_ids":[%d]
                                }
                                """.formatted(employee.id())))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(workflowTemplateService.processDueTemplates())
                .isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(workflowTemplateService.processDueTemplates())
                .isZero();

        mockMvc.perform(get("/erp/workflow-templates")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.name == 'Daily operations check')].last_run_at").isNotEmpty());

        mockMvc.perform(patch("/erp/workflow-templates/{templateId}/active", templateId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        mockMvc.perform(get("/erp/activity")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.event_type == 'WORKFLOW_TEMPLATE_CREATED')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.event_type == 'RECURRING_TASK_CREATED')]").isNotEmpty());
    }

    private Employee createApprovedEmployee(
            String adminToken,
            String name,
            String email
    ) throws Exception {
        String requestBody = """
                {
                  "name":"%s",
                  "email":"%s",
                  "password":"StrongPass123!"
                }
                """.formatted(name, email);
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(requestResponse, "$.id")).longValue();

        String approvalResponse = mockMvc.perform(post(
                                "/erp/account-requests/{requestId}/approve",
                                requestId)
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
                .andExpect(jsonPath("$.user_id").value(userId))
                .andReturn().getResponse().getContentAsString();
        return new Employee(userId, JsonPath.read(loginResponse, "$.access_token"));
    }

    private long createTask(String adminToken, long employeeId) throws Exception {
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"BEDAS teknik sartname kontrolu",
                                  "description":"Kritik maddeleri kontrol et.",
                                  "assignee_user_ids":[%d],
                                  "priority":"high"
                                }
                                """.formatted(employeeId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("todo"))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private long createTaskWithDuplicateAssignee(String adminToken, long employeeId) throws Exception {
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Duplicate-safe assignment",
                                  "assignee_user_ids":[%d,%d],
                                  "priority":"urgent"
                                }
                                """.formatted(employeeId, employeeId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
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

    private void deleteTestFiles() {
        Path root = Path.of("target", "test-data", "task-documents");
        if (!Files.exists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (java.io.IOException exception) {
                    throw new IllegalStateException(exception);
                }
            });
        } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record Employee(long id, String token) {
    }
}
