package com.docsbot.ops.erp;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class MobilePushControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("delete from erp_notification_deliveries");
        jdbcTemplate.update("delete from erp_notifications");
        jdbcTemplate.update("delete from erp_mobile_push_outbox");
        jdbcTemplate.update("delete from erp_mobile_push_tokens");
        jdbcTemplate.update("delete from erp_task_assignments");
        jdbcTemplate.update("delete from erp_tasks");
        jdbcTemplate.update("delete from erp_account_requests");
        // Messages before users: SET NULL sender FKs would violate the sender check constraints.
        jdbcTemplate.update("delete from erp_direct_messages");
        jdbcTemplate.update("delete from company_chat_messages");
        jdbcTemplate.update("delete from erp_users");
    }

    @Test
    void employeeCanRegisterAndUnregisterMobilePushToken() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createEmployee("mobile@example.com", adminToken);

        mockMvc.perform(post("/erp/mobile-push/tokens")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platform":"android",
                                  "device_id":"pixel-1",
                                  "token":"fcm-token-1",
                                  "app_version":"0.0.1"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value(employee.id()))
                .andExpect(jsonPath("$.platform").value("android"))
                .andExpect(jsonPath("$.device_id").value("pixel-1"))
                .andExpect(jsonPath("$.active").value(true));

        mockMvc.perform(delete("/erp/mobile-push/tokens")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platform":"android",
                                  "device_id":"pixel-1"
                                }
                                """))
                .andExpect(status().isNoContent());

        Integer active = jdbcTemplate.queryForObject(
                "select count(*) from erp_mobile_push_tokens where active=true",
                Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(0, active);
    }

    @Test
    void taskAssignmentQueuesMobilePushDeliveryAudit() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createEmployee("push-task@example.com", adminToken);

        mockMvc.perform(post("/erp/mobile-push/tokens")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platform":"android",
                                  "device_id":"pixel-2",
                                  "token":"fcm-token-2"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/erp/notification-preferences")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile_push_enabled\":true}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/tasks")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Mobile push task",
                                  "assignee_user_ids":[%d],
                                  "priority":"normal"
                                }
                                """.formatted(employee.id())))
                .andExpect(status().isOk());

        Integer notifications = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where user_id=?",
                Integer.class,
                employee.id());
        org.junit.jupiter.api.Assertions.assertEquals(1, notifications);
        Integer inAppDeliveries = jdbcTemplate.queryForObject(
                """
                        select count(*)
                          from erp_notification_deliveries delivery
                          join erp_notifications notification on notification.id = delivery.notification_id
                         where delivery.channel='IN_APP'
                           and delivery.status='ACCEPTED'
                           and notification.user_id=?
                        """,
                Integer.class,
                employee.id());
        org.junit.jupiter.api.Assertions.assertEquals(1, inAppDeliveries);
        Integer deliveries = waitForMobilePushDeliveries();
        org.junit.jupiter.api.Assertions.assertEquals(1, deliveries);
        Integer outboxItems = jdbcTemplate.queryForObject(
                "select count(*) from erp_mobile_push_outbox where status='PENDING'",
                Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, outboxItems);
    }

    @Test
    void appUpdateInfoAndBroadcastUseRegisteredMobileDevices() throws Exception {
        String adminToken = loginAdmin();
        Employee employee = createEmployee("update-user@example.com", adminToken);

        mockMvc.perform(post("/erp/mobile-push/tokens")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platform":"android",
                                  "device_id":"employee-phone",
                                  "token":"employee-fcm-token",
                                  "app_version":"1.0.6"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/mobile-push/tokens")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platform":"android",
                                  "device_id":"admin-phone",
                                  "token":"admin-fcm-token",
                                  "app_version":"1.0.6"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/erp/app-update?current_version=1.0.6")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latest_version").value("1.0.7"))
                .andExpect(jsonPath("$.update_available").value(true))
                .andExpect(jsonPath("$.required").value(true))
                .andExpect(jsonPath("$.title").value("Yeni versiyon geldi"));

        mockMvc.perform(post("/erp/app-update/broadcast")
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/erp/app-update/broadcast")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latest_version").value("1.0.7"))
                .andExpect(jsonPath("$.active_device_users").value(2))
                .andExpect(jsonPath("$.notifications_created").value(2));

        Integer appUpdateNotifications = jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type='app_update_available'",
                Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(2, appUpdateNotifications);
    }

    private Integer waitForMobilePushDeliveries() throws InterruptedException {
        Integer deliveries = 0;
        for (int attempt = 0; attempt < 20; attempt++) {
            deliveries = jdbcTemplate.queryForObject(
                    "select count(*) from erp_notification_deliveries where channel='MOBILE_PUSH' and status='ACCEPTED'",
                    Integer.class);
            if (deliveries != null && deliveries > 0) {
                return deliveries;
            }
            Thread.sleep(50);
        }
        return deliveries;
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }

    private Employee createEmployee(String email, String adminToken) throws Exception {
        String requestResponse = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Mobile Employee",
                                  "email":"%s",
                                  "password":"user123456"
                                }
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number requestId = JsonPath.read(requestResponse, "$.id");
        String approvalResponse = mockMvc.perform(post("/erp/account-requests/%d/approve".formatted(requestId.longValue()))
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number userId = JsonPath.read(approvalResponse, "$.id");

        String loginResponse = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"user123456"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Employee(userId.longValue(), JsonPath.read(loginResponse, "$.access_token"));
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Employee(long id, String token) {
    }
}
