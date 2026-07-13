package com.docsbot.ops.erp;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class TaskDocumentGroupLinkIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpTaskRepository taskRepository;

    @Autowired
    private ErpTaskAssignmentRepository assignmentRepository;

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
        assignmentRepository.deleteAll();
        taskRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void adminCanLinkATaskToADocumentGroupOnceAndReopenIt() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createApprovedEmployee(adminToken, "Deniz Room", "deniz.room@example.com");
        long taskId = createTask(adminToken, employee.id());

        long groupId = createRoom(adminToken, "Görev odası", employee.id());

        mockMvc.perform(post("/erp/tasks/{taskId}/document-group", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"document_group_id\":" + groupId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document_group_id").value(groupId));

        // Reopening the task shows the linked room id.
        mockMvc.perform(post("/erp/tasks/{taskId}/document-group", taskId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"document_group_id\":" + groupId + "}"))
                .andExpect(status().isBadRequest());

        // Employees cannot link rooms.
        long otherGroupId = createRoom(adminToken, "Baska oda", employee.id());
        long otherTaskId = createTask(adminToken, employee.id());
        mockMvc.perform(post("/erp/tasks/{taskId}/document-group", otherTaskId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"document_group_id\":" + otherGroupId + "}"))
                .andExpect(status().isForbidden());
    }

    private long createRoom(String adminToken, String name, long memberUserId) throws Exception {
        String response = mockMvc.perform(post("/document-groups")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","member_user_ids":[%d]}
                                """.formatted(name, memberUserId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.group.id")).longValue();
    }

    private long createTask(String adminToken, long employeeId) throws Exception {
        String response = mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Oda baglantili gorev","assignee_user_ids":[%d]}
                                """.formatted(employeeId)))
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
