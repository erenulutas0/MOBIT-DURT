package com.docsbot.ops.tender;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class CommunicationSearchIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpDirectMessageRepository directMessageRepository;

    @Autowired
    private DocumentGroupMessageRepository roomMessageRepository;

    @Autowired
    private DocumentGroupRepository documentGroupRepository;

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
        roomMessageRepository.deleteAll();
        documentGroupRepository.deleteAll();
        directMessageRepository.deleteAll();
        accountRequestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void searchFindsDirectMessagesAndRoomMessagesButNotOtherEmployeesRooms() throws Exception {
        String adminToken = loginAdmin();
        Employee alice = createApprovedEmployee(adminToken, "Alice Search", "alice.search@example.com");
        Employee bob = createApprovedEmployee(adminToken, "Bob Search", "bob.search@example.com");

        sendDirect(alice.token(), null, "Sözleşme taslağı hazır, kontrol eder misin?");

        long aliceRoomId = createRoom(adminToken, "Alice Odası", alice.id());
        sendRoomMessage(alice.token(), aliceRoomId, "Sözleşme dosyasını odaya yükledim.");

        long bobRoomId = createRoom(adminToken, "Bob Odası", bob.id());
        sendRoomMessage(bob.token(), bobRoomId, "Sözleşme bekleniyor.");

        // Admin sees both employees' rooms and the direct message.
        mockMvc.perform(get("/erp/search").param("q", "sözleşme")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].type", hasItem("direct_message")))
                .andExpect(jsonPath("$[*].type", hasItem("room_message")))
                .andExpect(jsonPath("$.length()").value(3));

        // Alice only sees her own room's message and her own direct message thread, not Bob's room.
        mockMvc.perform(get("/erp/search").param("q", "sözleşme")
                        .header("Authorization", bearer(alice.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].group_name", hasItem("Alice Odası")));

        // Short queries are rejected client-side conceptually but the backend just returns empty.
        mockMvc.perform(get("/erp/search").param("q", "s")
                        .header("Authorization", bearer(alice.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
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

    private void sendRoomMessage(String token, long groupId, String body) throws Exception {
        mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + body + "\"}"))
                .andExpect(status().isOk());
    }

    private void sendDirect(String token, Long recipientUserId, String body) throws Exception {
        String recipientField = recipientUserId == null ? "" : "\"recipient_user_id\":" + recipientUserId + ",";
        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + recipientField + "\"body\":\"" + body + "\"}"))
                .andExpect(status().isOk());
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
