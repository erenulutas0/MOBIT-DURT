package com.docsbot.ops.erp;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class MessageReplyIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpDirectMessageRepository directMessageRepository;

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

    @Autowired
    private DocumentGroupMessageRepository roomMessageRepository;

    @Autowired
    private DocumentGroupRepository documentGroupRepository;

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
    void directMessageReplyMustBeInTheSameThread() throws Exception {
        String adminToken = loginAdmin();
        Employee alice = createApprovedEmployee(adminToken, "Alice Reply", "alice.reply@example.com");
        Employee bob = createApprovedEmployee(adminToken, "Bob Reply", "bob.reply@example.com");

        long aliceMessageId = sendDirectText(alice.token(), null, "Merhaba admin", null);

        String replyResponse = mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipient_user_id":%d,"body":"Selam Alice","reply_to_message_id":%d}
                                """.formatted(alice.id(), aliceMessageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply_to_message_id").value(aliceMessageId))
                .andReturn().getResponse().getContentAsString();
        long adminReplyId = ((Number) JsonPath.read(replyResponse, "$.id")).longValue();

        // Replying to a message id from a completely different thread (Bob's) is rejected.
        long bobMessageId = sendDirectText(bob.token(), null, "Merhaba admin ben Bob", null);
        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipient_user_id":%d,"body":"Yanlis thread","reply_to_message_id":%d}
                                """.formatted(alice.id(), bobMessageId)))
                .andExpect(status().isBadRequest());

        // Unknown reply target is rejected.
        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipient_user_id":%d,"body":"Yok boyle bir mesaj","reply_to_message_id":999999}
                                """.formatted(alice.id())))
                .andExpect(status().isBadRequest());

        // Alice can reply back to the admin's reply.
        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(alice.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"body":"Tesekkurler","reply_to_message_id":%d}
                                """.formatted(adminReplyId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply_to_message_id").value(adminReplyId));
    }

    @Test
    void onlyTheSenderMayDeleteADirectMessageForEveryone() throws Exception {
        // Before this was guarded, the single check on the delete path was visibleTo(), which is
        // true for both sides of a conversation — so a recipient could permanently remove the
        // sender's own message and, after commit, the media file with it.
        String adminToken = loginAdmin();
        Employee alice = createApprovedEmployee(adminToken, "Alice Sil", "alice.sil@example.com");
        Employee bob = createApprovedEmployee(adminToken, "Bob Sil", "bob.sil@example.com");

        long messageId = sendDirectText(alice.token(), bob.id(), "Teklifimiz 8.250.000", null);

        // The recipient may not delete what he did not write.
        mockMvc.perform(delete("/erp/messages/" + messageId + "?scope=everyone")
                        .header("Authorization", bearer(bob.token())))
                .andExpect(status().isForbidden());
        assertThat(directMessageRepository.findById(messageId)).isPresent();

        // Hiding it for himself is still his to do, and leaves the row where it is.
        mockMvc.perform(delete("/erp/messages/" + messageId + "?scope=me")
                        .header("Authorization", bearer(bob.token())))
                .andExpect(status().isNoContent());
        assertThat(directMessageRepository.findById(messageId)).isPresent();

        // The sender may.
        mockMvc.perform(delete("/erp/messages/" + messageId + "?scope=everyone")
                        .header("Authorization", bearer(alice.token())))
                .andExpect(status().isNoContent());
        assertThat(directMessageRepository.findById(messageId)).isEmpty();
    }

    @Test
    void documentRoomMessageReplyMustBeInTheSameRoom() throws Exception {
        String adminToken = loginAdmin();
        Employee alice = createApprovedEmployee(adminToken, "Ada Room", "ada.room@example.com");

        long roomAId = createRoom(adminToken, "Oda A", alice.id());
        long roomBId = createRoom(adminToken, "Oda B", alice.id());

        long roomAMessageId = sendRoomMessage(adminToken, roomAId, "Oda A ilk mesaj", null);
        sendRoomMessage(adminToken, roomAId, "Oda A cevap", roomAMessageId).andExpect(status().isOk())
                .andExpect(jsonPath("$.reply_to_message_id").value(roomAMessageId));

        long roomBMessageId = sendRoomMessage(adminToken, roomBId, "Oda B mesaj", null);
        // Cross-room reply is rejected: roomBMessageId does not belong to roomAId.
        sendRoomMessage(adminToken, roomAId, "Capraz oda cevap", roomBMessageId)
                .andExpect(status().isBadRequest());
    }

    @Test
    void resendingWithSameClientMessageIdIsIdempotentForDirectAndRoomMessages() throws Exception {
        String adminToken = loginAdmin();
        Employee bob = createApprovedEmployee(adminToken, "Bora Idem", "bora.idem@example.com");

        // Direct: same client_message_id twice → one row, same id returned.
        String firstDirect = mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipient_user_id":%d,"body":"Merhaba","client_message_id":"cmid-direct-1"}
                                """.formatted(bob.id())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long firstDirectId = ((Number) JsonPath.read(firstDirect, "$.id")).longValue();

        mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipient_user_id":%d,"body":"Merhaba tekrar","client_message_id":"cmid-direct-1"}
                                """.formatted(bob.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value((int) firstDirectId));
        assertThat(directMessageRepository.count()).isEqualTo(1);

        // Room: same client_message_id twice → one row, same id returned.
        long roomId = createRoom(adminToken, "Idem Oda", bob.id());
        String firstRoom = mockMvc.perform(post("/document-groups/{groupId}/messages", roomId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Oda mesaji\",\"client_message_id\":\"cmid-room-1\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long firstRoomId = ((Number) JsonPath.read(firstRoom, "$.id")).longValue();

        mockMvc.perform(post("/document-groups/{groupId}/messages", roomId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Oda mesaji tekrar\",\"client_message_id\":\"cmid-room-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value((int) firstRoomId));
        assertThat(roomMessageRepository.count()).isEqualTo(1);
    }

    @Test
    void markingRoomReadSkipsOwnMessagesCountsOthersAndIsIdempotent() throws Exception {
        String adminToken = loginAdmin();
        Employee alice = createApprovedEmployee(adminToken, "Ayla Read", "ayla.read@example.com");
        long roomId = createRoom(adminToken, "Okuma Odasi", alice.id());

        // Two messages from the admin, one from Alice.
        sendRoomMessage(adminToken, roomId, "Admin 1", null);
        sendRoomMessage(adminToken, roomId, "Admin 2", null);
        long aliceMessageId = sendRoomMessage(alice.token(), roomId, "Ayla mesaji", null);

        // Alice reads through her own latest message: the two admin messages count, hers does not.
        markReadThrough(alice.token(), roomId, aliceMessageId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated_count").value(2));

        // Re-marking the same point is a no-op — already-read messages are not re-counted.
        markReadThrough(alice.token(), roomId, aliceMessageId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated_count").value(0));
    }

    private org.springframework.test.web.servlet.ResultActions markReadThrough(
            String token, long groupId, long throughMessageId
    ) throws Exception {
        return mockMvc.perform(patch("/document-groups/{groupId}/messages/read-through", groupId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"through_message_id\":%d}".formatted(throughMessageId)));
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

    private long sendRoomMessage(String token, long groupId, String body, Long replyToMessageId) throws Exception {
        return ((Number) JsonPath.read(
                sendRoomMessage0(token, groupId, body, replyToMessageId).andReturn().getResponse().getContentAsString(),
                "$.id")).longValue();
    }

    private org.springframework.test.web.servlet.ResultActions sendRoomMessage(
            String token, long groupId, String body, long replyToMessageId
    ) throws Exception {
        return sendRoomMessage0(token, groupId, body, replyToMessageId);
    }

    private org.springframework.test.web.servlet.ResultActions sendRoomMessage0(
            String token, long groupId, String body, Long replyToMessageId
    ) throws Exception {
        String replyField = replyToMessageId == null ? "" : ",\"reply_to_message_id\":" + replyToMessageId;
        return mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"body":"%s"%s}
                        """.formatted(body, replyField)));
    }

    private long sendDirectText(String token, Long recipientUserId, String body, Long replyToMessageId) throws Exception {
        String recipientField = recipientUserId == null ? "" : "\"recipient_user_id\":" + recipientUserId + ",";
        String replyField = replyToMessageId == null ? "" : ",\"reply_to_message_id\":" + replyToMessageId;
        String response = mockMvc.perform(post("/erp/messages")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {%s"body":"%s"%s}
                                """.formatted(recipientField, body, replyField)))
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
