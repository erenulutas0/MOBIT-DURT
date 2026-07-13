package com.docsbot.ops.erp;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class ErpTaskHierarchyIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

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
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void subtaskCreationEnforcesParentStateAndDepth() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Ayse Demir", "ayse.hier@example.com");

        long parentId = createTask(adminToken, "Ana gorev", employee.id(), null);

        String subtaskResponse = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Alt gorev","assignee_user_ids":[%d],"parent_task_id":%d}
                                """.formatted(employee.id(), parentId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parent_task_id").value(parentId))
                .andReturn().getResponse().getContentAsString();
        long subtaskId = ((Number) JsonPath.read(subtaskResponse, "$.id")).longValue();

        // Depth limit: a subtask cannot have its own subtasks.
        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Torun gorev","parent_task_id":%d}
                                """.formatted(subtaskId)))
                .andExpect(status().isBadRequest());

        // Unknown parent is rejected.
        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Sahipsiz","parent_task_id":999999}
                                """))
                .andExpect(status().isBadRequest());

        // Closed parent is rejected.
        long cancelledId = createTask(adminToken, "Iptal edilecek", employee.id(), null);
        mockMvc.perform(patch("/erp/tasks/{taskId}", cancelledId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"cancelled\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Kapali ebeveyn","parent_task_id":%d}
                                """.formatted(cancelledId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void parentCompletionIsBlockedWhileSubtasksAreOpen() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Can Yilmaz", "can.hier@example.com");

        long parentId = createTask(adminToken, "Ana gorev", employee.id(), null);
        long subtaskId = createTask(adminToken, "Alt gorev", employee.id(), parentId);

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", parentId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("subtasks")));

        completeTask(adminToken, employee.token(), subtaskId);

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", parentId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", parentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("done"));
    }

    @Test
    void dependencyRulesRejectCyclesDuplicatesAndSelfReference() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Ece Kaya", "ece.hier@example.com");

        long first = createTask(adminToken, "Birinci", employee.id(), null);
        long second = createTask(adminToken, "Ikinci", employee.id(), null);
        long third = createTask(adminToken, "Ucuncu", employee.id(), null);

        addDependency(adminToken, second, first).andExpect(status().isOk())
                .andExpect(jsonPath("$.predecessor_task_id").value(first))
                .andExpect(jsonPath("$.successor_task_id").value(second));
        addDependency(adminToken, third, second).andExpect(status().isOk());

        // Duplicate edge.
        addDependency(adminToken, second, first).andExpect(status().isBadRequest());
        // Self dependency.
        addDependency(adminToken, first, first).andExpect(status().isBadRequest());
        // Transitive cycle: first depends on third would close first -> second -> third -> first.
        addDependency(adminToken, first, third)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("cycle")));

        // Employees cannot manage dependencies.
        mockMvc.perform(post("/erp/tasks/{taskId}/dependencies", second)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"predecessor_task_id\":%d}".formatted(third)))
                .andExpect(status().isForbidden());

        // Overview exposes the dependency pairs.
        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task_dependencies[*].predecessor_task_id",
                        hasItem((int) first)));

        // Removal works once and 404s afterwards.
        mockMvc.perform(delete("/erp/tasks/{taskId}/dependencies/{predecessorId}", third, second)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/erp/tasks/{taskId}/dependencies/{predecessorId}", third, second)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    void successorCompletionWaitsForPredecessorAndUnblockNotificationFires() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Mert Acar", "mert.hier@example.com");

        long predecessor = createTask(adminToken, "Onceki gorev", employee.id(), null);
        long successor = createTask(adminToken, "Sonraki gorev", employee.id(), null);
        addDependency(adminToken, successor, predecessor).andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", successor)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("waiting")));

        completeTask(adminToken, employee.token(), predecessor);

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].type", hasItem("task_unblocked")));

        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", successor)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions addDependency(
            String adminToken,
            long successorTaskId,
            long predecessorTaskId
    ) throws Exception {
        return mockMvc.perform(post("/erp/tasks/{taskId}/dependencies", successorTaskId)
                .header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"predecessor_task_id\":%d}".formatted(predecessorTaskId)));
    }

    private void completeTask(String adminToken, String employeeToken, long taskId) throws Exception {
        mockMvc.perform(post("/erp/tasks/{taskId}/completion-request", taskId)
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/erp/tasks/{taskId}/approve-completion", taskId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("done"));
    }

    private long createTask(String adminToken, String title, long employeeId, Long parentTaskId) throws Exception {
        String parentField = parentTaskId == null ? "" : ",\"parent_task_id\":" + parentTaskId;
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"%s","assignee_user_ids":[%d]%s}
                                """.formatted(title, employeeId, parentField)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
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
