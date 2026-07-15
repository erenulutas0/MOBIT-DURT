package com.docsbot.ops.dashboard;

import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Comparator;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class TenderDashboardIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clean() throws Exception {
        jdbcTemplate.update("delete from erp_task_documents");
        jdbcTemplate.update("delete from document_group_messages");
        jdbcTemplate.update("delete from document_group_document_versions");
        jdbcTemplate.update("delete from document_group_documents");
        jdbcTemplate.update("delete from document_group_members");
        jdbcTemplate.update("delete from document_groups");
        jdbcTemplate.update("delete from document_share_links");
        jdbcTemplate.update("delete from document_user_states");
        jdbcTemplate.update("delete from erp_notifications");
        jdbcTemplate.update("delete from erp_task_comments");
        jdbcTemplate.update("delete from erp_task_assignments");
        jdbcTemplate.update("delete from erp_tasks");
        jdbcTemplate.update("delete from erp_team_members");
        jdbcTemplate.update("delete from erp_teams");
        jdbcTemplate.update("delete from erp_account_requests");
        // Messages must go before users: their sender/recipient FKs are ON DELETE SET NULL, and a
        // NULL sender_user_id on a 'user' message violates ck_erp_direct_messages_sender.
        jdbcTemplate.update("delete from erp_direct_messages");
        jdbcTemplate.update("delete from company_chat_messages");
        jdbcTemplate.update("delete from erp_users");
        jdbcTemplate.update("delete from auth_audit_events");
        jdbcTemplate.update("delete from documents");
        jdbcTemplate.update("delete from tenders");
        jdbcTemplate.update("delete from tender_organizations");
        deleteTree(Path.of("target", "test-data"));
        deleteTree(Path.of("target", "test-vault"));
    }

    @Test
    void membersUseDocumentGroupsForInternalDocumentRooms() throws Exception {
        String adminToken = loginAdmin();
        EmployeeLogin employee = createApprovedEmployee(
                "Tender Employee",
                "tender.employee@example.com");
        EmployeeLogin reviewer = createApprovedEmployee(
                "Tender Reviewer",
                "tender.reviewer@example.com");
        EmployeeLogin outsider = createApprovedEmployee(
                "Outside Employee",
                "outside.employee@example.com");

        String createResponse = mockMvc.perform(post("/document-groups")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Patron Evrak Odası",
                                  "description":"Patrona hazırlanacak haftalık dokümanlar",
                                  "member_user_ids":[%d,%d]
                                }
                                """.formatted(employee.userId(), reviewer.userId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.group.name").value("Patron Evrak Odası"))
                .andExpect(jsonPath("$.group.member_count").value(2))
                .andExpect(jsonPath("$.members[?(@.user_id == %d)]".formatted(employee.userId())).isNotEmpty())
                .andExpect(jsonPath("$.members[?(@.user_id == %d)]".formatted(reviewer.userId())).isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        long groupId = ((Number) JsonPath.read(createResponse, "$.group.id")).longValue();

        mockMvc.perform(get("/document-groups")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(groupId));

        mockMvc.perform(get("/document-groups/{groupId}", groupId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isForbidden());

        byte[] content = "Boss review packet".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "patron-paketi.txt",
                MediaType.TEXT_PLAIN_VALUE,
                content);
        String uploadResponse = mockMvc.perform(multipart("/document-groups/{groupId}/documents", groupId)
                        .file(file)
                        .param("note", "Cuma sunumu için")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.uploaded_by_user_id").value(employee.userId()))
                .andExpect(jsonPath("$.note").value("Cuma sunumu için"))
                .andExpect(jsonPath("$.document.source").value("dashboard"))
                .andExpect(jsonPath("$.document.organization").value("DOC_GROUP"))
                .andReturn().getResponse().getContentAsString();
        long groupDocumentId = ((Number) JsonPath.read(uploadResponse, "$.id")).longValue();
        long documentId = ((Number) JsonPath.read(uploadResponse, "$.document_id")).longValue();

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'document_group_document_uploaded')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.title == 'Yeni doküman paylaşıldı')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.event_key == 'document-group-document-uploaded:%d:%d:user:%d')]"
                        .formatted(groupId, groupDocumentId, reviewer.userId())).isNotEmpty());

        mockMvc.perform(get("/document-groups/{groupId}/documents", groupId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(groupDocumentId))
                .andExpect(jsonPath("$[0].document_id").value(documentId));

        mockMvc.perform(get("/document-groups/{groupId}/documents/{groupDocumentId}/content", groupId, groupDocumentId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(content().bytes(content));

        byte[] revisedContent = "Boss review packet revision two".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile revisedFile = new MockMultipartFile(
                "file",
                "patron-paketi-v2.txt",
                MediaType.TEXT_PLAIN_VALUE,
                revisedContent);
        mockMvc.perform(multipart("/document-groups/{groupId}/documents/{groupDocumentId}/versions", groupId, groupDocumentId)
                        .file(revisedFile)
                        .param("note", "Revizyon 2")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(groupDocumentId))
                .andExpect(jsonPath("$.document.original_filename").value("patron-paketi-v2.txt"));

        String versionsResponse = mockMvc.perform(get("/document-groups/{groupId}/documents/{groupDocumentId}/versions", groupId, groupDocumentId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].version_number").value(2))
                .andExpect(jsonPath("$[0].document.original_filename").value("patron-paketi-v2.txt"))
                .andExpect(jsonPath("$[1].version_number").value(1))
                .andExpect(jsonPath("$[1].document.original_filename").value("patron-paketi.txt"))
                .andReturn().getResponse().getContentAsString();
        long firstVersionId = ((Number) JsonPath.read(versionsResponse, "$[1].id")).longValue();

        mockMvc.perform(get("/document-groups/{groupId}/documents/{groupDocumentId}/versions/{versionId}/content",
                        groupId,
                        groupDocumentId,
                        firstVersionId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(content().bytes(content));

        String messageResponse = mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "body":"Patron paketi hazır, kontrol edebilirsiniz.",
                                  "client_message_id":"room-retry-1"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_user_id").value(employee.userId()))
                .andExpect(jsonPath("$.body").value("Patron paketi hazır, kontrol edebilirsiniz."))
                .andExpect(jsonPath("$.client_message_id").value("room-retry-1"))
                .andExpect(jsonPath("$.delivered_at").isNotEmpty())
                .andExpect(jsonPath("$.sequence_no").isNotEmpty())
                .andExpect(jsonPath("$.delivery_status").value("delivered"))
                .andReturn().getResponse().getContentAsString();
        long messageId = ((Number) JsonPath.read(messageResponse, "$.id")).longValue();

        mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "body":"Patron paketi hazır, kontrol edebilirsiniz.",
                                  "client_message_id":"room-retry-1"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(messageId));

        mockMvc.perform(get("/document-groups")
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].unread_message_count").value(1));

        mockMvc.perform(patch("/document-groups/{groupId}/messages/read-through", groupId)
                        .header("Authorization", bearer(reviewer.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"through_message_id":%d}
                                """.formatted(messageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated_count").value(1));

        mockMvc.perform(patch("/document-groups/{groupId}/messages/read-through", groupId)
                        .header("Authorization", bearer(reviewer.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"through_message_id":%d}
                                """.formatted(messageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated_count").value(0));

        mockMvc.perform(get("/document-groups")
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].unread_message_count").value(0));

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'document_group_message')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.title == 'Patron Evrak Odası')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.event_key == 'document-group-message:%d:%d:user:%d')]"
                        .formatted(groupId, messageId, reviewer.userId())).isNotEmpty());

        mockMvc.perform(get("/erp/notifications")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'document_group_message')]").isNotEmpty());

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(messageId))
                .andExpect(jsonPath("$[0].body").value("Patron paketi hazır, kontrol edebilirsiniz."));

        mockMvc.perform(get("/document-groups/{groupId}/documents/{groupDocumentId}/content", groupId, groupDocumentId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(outsider.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"body":"Gizli odaya yazamam."}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void documentGroupMessagesPreserveMediaPayloadsAndAccessControls() throws Exception {
        String adminToken = loginAdmin();
        EmployeeLogin employee = createApprovedEmployee(
                "Media Room Employee",
                "media.room.employee@example.com");
        EmployeeLogin reviewer = createApprovedEmployee(
                "Media Room Reviewer",
                "media.room.reviewer@example.com");
        EmployeeLogin outsider = createApprovedEmployee(
                "Media Room Outsider",
                "media.room.outsider@example.com");

        String createResponse = mockMvc.perform(post("/document-groups")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Medya Test Odası",
                                  "member_user_ids":[%d,%d]
                                }
                                """.formatted(employee.userId(), reviewer.userId())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long groupId = ((Number) JsonPath.read(createResponse, "$.group.id")).longValue();

        String imageData = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
        String imageResponse = mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "body":"İletilen doküman: saha.jpg",
                                  "message_kind":"image",
                                  "media_mime_type":"image/jpeg",
                                  "media_data":"%s"
                                }
                                """.formatted(imageData)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_user_id").value(employee.userId()))
                .andExpect(jsonPath("$.message_kind").value("image"))
                .andExpect(jsonPath("$.media_mime_type").value("image/jpeg"))
                .andExpect(jsonPath("$.media_data").value(nullValue()))
                .andExpect(jsonPath("$.media_url").value(startsWith("/document-groups/%d/messages/".formatted(groupId))))
                .andExpect(jsonPath("$.media_ref").value(startsWith("media:document-group-")))
                .andReturn().getResponse().getContentAsString();
        long imageMessageId = ((Number) JsonPath.read(imageResponse, "$.id")).longValue();
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                        "select media_data from document_group_messages where id = ?",
                        String.class,
                        imageMessageId))
                .startsWith("media:document-group-");

        mockMvc.perform(get("/document-groups/{groupId}/messages/{messageId}/media", groupId, imageMessageId)
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("image/jpeg"));

        String voiceData = "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ";
        mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(reviewer.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "body":"Ses mesajı",
                                  "message_kind":"voice",
                                  "media_mime_type":"audio/webm",
                                  "media_data":"%s",
                                  "media_duration_ms":2200
                                }
                                """.formatted(voiceData)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.author_user_id").value(reviewer.userId()))
                .andExpect(jsonPath("$.body").value("Ses mesajı"))
                .andExpect(jsonPath("$.message_kind").value("voice"))
                .andExpect(jsonPath("$.media_mime_type").value("audio/webm"))
                .andExpect(jsonPath("$.media_data").value(nullValue()))
                .andExpect(jsonPath("$.media_url").value(startsWith("/document-groups/%d/messages/".formatted(groupId))))
                .andExpect(jsonPath("$.media_ref").value(startsWith("media:document-group-")))
                .andExpect(jsonPath("$.media_duration_ms").value(2200));

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)]".formatted(imageMessageId)).isNotEmpty())
                .andExpect(jsonPath("$[?(@.message_kind == 'voice')]").isNotEmpty());

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/document-groups/{groupId}/messages/{messageId}/media", groupId, imageMessageId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "body":"Yanlış medya",
                                  "message_kind":"image",
                                  "media_mime_type":"image/jpeg",
                                  "media_data":"data:audio/webm;base64,AAAA"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Image message data is required"));

        mockMvc.perform(delete("/document-groups/{groupId}/messages/{messageId}", groupId, imageMessageId)
                        .header("Authorization", bearer(outsider.token())))
                .andExpect(status().isForbidden());
    }

    @Test
    void documentGroupMessagesCanBeDeletedOnlyForCurrentViewer() throws Exception {
        String adminToken = loginAdmin();
        EmployeeLogin employee = createApprovedEmployee(
                "Hidden Room Employee",
                "hidden.room.employee@example.com");
        EmployeeLogin reviewer = createApprovedEmployee(
                "Hidden Room Reviewer",
                "hidden.room.reviewer@example.com");

        String createResponse = mockMvc.perform(post("/document-groups")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Gizleme Test Odası",
                                  "member_user_ids":[%d,%d]
                                }
                                """.formatted(employee.userId(), reviewer.userId())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long groupId = ((Number) JsonPath.read(createResponse, "$.group.id")).longValue();
        long messageId = sendGroupText(employee.token(), groupId, "Bu oda mesajı sadece inceleyenden gizlenecek.");

        mockMvc.perform(delete("/document-groups/{groupId}/messages/{messageId}", groupId, messageId)
                        .queryParam("scope", "me")
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(reviewer.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)]".formatted(messageId)).isEmpty());

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)]".formatted(messageId)).isNotEmpty());
    }

    @Test
    void documentGroupMessagesSupportCursorPaginationWithoutBreakingAscendingDisplayOrder() throws Exception {
        String adminToken = loginAdmin();
        EmployeeLogin employee = createApprovedEmployee(
                "Paged Room Employee",
                "paged.room.employee@example.com");

        String createResponse = mockMvc.perform(post("/document-groups")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Sayfalı Oda",
                                  "member_user_ids":[%d]
                                }
                                """.formatted(employee.userId())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long groupId = ((Number) JsonPath.read(createResponse, "$.group.id")).longValue();

        long firstId = sendGroupText(employee.token(), groupId, "Birinci oda mesajı");
        long secondId = sendGroupText(employee.token(), groupId, "İkinci oda mesajı");
        long thirdId = sendGroupText(employee.token(), groupId, "Üçüncü oda mesajı");

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .queryParam("limit", "2")
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(secondId))
                .andExpect(jsonPath("$[1].id").value(thirdId));

        mockMvc.perform(get("/document-groups/{groupId}/messages", groupId)
                        .queryParam("limit", "2")
                        .queryParam("before_id", Long.toString(secondId))
                        .header("Authorization", bearer(employee.token())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(firstId));
    }

    @Test
    void adminUsesDocumentFavoritesRecentFilesAndRevocableShareLinks() throws Exception {
        String adminToken = loginAdmin();
        byte[] fileBytes = "Shareable tender workspace document".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "workspace-note.txt",
                MediaType.TEXT_PLAIN_VALUE,
                fileBytes);
        String uploadResponse = mockMvc.perform(multipart("/dashboard/upload")
                        .file(file)
                        .param("internal_unit", "Mobit")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .param("caption", "Workspace document")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long documentId = ((Number) JsonPath.read(uploadResponse, "$.id")).longValue();

        mockMvc.perform(put("/documents/{documentId}/favorite", documentId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"favorite\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.id").value(documentId))
                .andExpect(jsonPath("$.favorite").value(true))
                .andExpect(jsonPath("$.favorited_at").isNotEmpty());

        mockMvc.perform(get("/documents/favorites")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].document.id").value(documentId));

        mockMvc.perform(get("/dashboard/files/{documentId}/view", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));
        mockMvc.perform(get("/dashboard/files/{documentId}", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/documents/recent")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].document.id").value(documentId))
                .andExpect(jsonPath("$[0].access_count").value(2))
                .andExpect(jsonPath("$[0].last_accessed_at").isNotEmpty());

        String shareResponse = mockMvc.perform(post("/documents/{documentId}/share-links", documentId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expires_in_hours\":24}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.share.document_id").value(documentId))
                .andExpect(jsonPath("$.share.active").value(true))
                .andExpect(jsonPath("$.access_url").value(containsString("/shared/documents/")))
                .andReturn().getResponse().getContentAsString();
        long shareLinkId = ((Number) JsonPath.read(shareResponse, "$.share.id")).longValue();
        String accessUrl = JsonPath.read(shareResponse, "$.access_url");

        mockMvc.perform(get(accessUrl))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/documents/{documentId}/share-links", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(shareLinkId))
                .andExpect(jsonPath("$[0].access_count").value(1))
                .andExpect(jsonPath("$[0].last_accessed_at").isNotEmpty());

        mockMvc.perform(delete("/documents/share-links/{shareLinkId}", shareLinkId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.revoked_at").isNotEmpty());

        mockMvc.perform(get(accessUrl))
                .andExpect(status().isNotFound());

        mockMvc.perform(put("/documents/{documentId}/favorite", documentId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"favorite\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.favorite").value(false));

        mockMvc.perform(get("/documents/favorites")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        """
                        select count(*) from auth_audit_events
                        where event_type='document_share_accessed'
                          and subject_id=?
                        """,
                        Long.class,
                        Long.toString(documentId)));
        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        """
                        select count(*) from auth_audit_events
                        where event_type='document_share_rejected'
                          and subject_id=?
                        """,
                        Long.class,
                        Long.toString(documentId)));
    }

    @Test
    void publicShareDownloadRejectsBogusAndExpiredTokens() throws Exception {
        String adminToken = loginAdmin();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "shared-note.txt",
                MediaType.TEXT_PLAIN_VALUE,
                "public share test".getBytes(StandardCharsets.UTF_8));
        String uploadResponse = mockMvc.perform(multipart("/dashboard/upload")
                        .file(file)
                        .param("internal_unit", "Mobit")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long documentId = ((Number) JsonPath.read(uploadResponse, "$.id")).longValue();

        // A token that was never issued is a 404 (not a 500 / not a leak).
        mockMvc.perform(get("/shared/documents/{token}", "definitely-not-a-real-token"))
                .andExpect(status().isNotFound());

        String shareResponse = mockMvc.perform(post("/documents/{documentId}/share-links", documentId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expires_in_hours\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long shareLinkId = ((Number) JsonPath.read(shareResponse, "$.share.id")).longValue();
        String accessUrl = JsonPath.read(shareResponse, "$.access_url");

        // Valid, unexpired link serves the document.
        mockMvc.perform(get(accessUrl)).andExpect(status().isOk());

        // Backdate expiry to the past (min creation window is 1h, so simulate the clock advancing).
        jdbcTemplate.update(
                "update document_share_links set expires_at = ? where id = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minus(java.time.Duration.ofHours(2))),
                shareLinkId);

        // The expired link is now rejected as 404.
        mockMvc.perform(get(accessUrl)).andExpect(status().isNotFound());
    }

    @Test
    void adminUploadsClassifiesDeduplicatesAndWritesVaultNotes() throws Exception {
        String adminToken = loginAdmin();
        byte[] pdf = "%PDF-1.7\nTender technical specification".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile firstFile = new MockMultipartFile(
                "file",
                "BEDAS-2026-teknik-sartname.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                pdf);

        String firstResponse = mockMvc.perform(multipart("/dashboard/upload")
                        .file(firstFile)
                        .param("internal_unit", "Mobit")
                        .param("organization", "BEDAŞ")
                        .param("year", "2026")
                        .param("caption", "Teknik şartname")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("dashboard"))
                .andExpect(jsonPath("$.organization").value("BEDAS"))
                .andExpect(jsonPath("$.internal_unit").value("MOBIT"))
                .andExpect(jsonPath("$.document_type").value("technical_spec"))
                .andExpect(jsonPath("$.status").value("stored"))
                .andReturn().getResponse().getContentAsString();

        String tenderId = JsonPath.read(firstResponse, "$.tender_id");
        String filePath = JsonPath.read(firstResponse, "$.file_path");
        Path stored = Path.of("target", "test-data").resolve(filePath)
                .toAbsolutePath()
                .normalize();
        org.junit.jupiter.api.Assertions.assertTrue(Files.isRegularFile(stored));
        org.junit.jupiter.api.Assertions.assertArrayEquals(pdf, Files.readAllBytes(stored));
        org.junit.jupiter.api.Assertions.assertTrue(
                tenderId.matches("BEDAS-2026-\\d{8}-001"));

        mockMvc.perform(get("/tenders/{tenderId}/missing-documents", tenderId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("missing"))
                .andExpect(jsonPath("$.present_types[0]").value("technical_spec"))
                .andExpect(jsonPath("$.missing_types[0]").value("administrative_spec"))
                .andExpect(jsonPath("$.recommendations[0]").value(containsString("İdari şartname")));

        MockMultipartFile duplicateFile = new MockMultipartFile(
                "file",
                "copy.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                pdf);
        mockMvc.perform(multipart("/dashboard/upload")
                        .file(duplicateFile)
                        .param("internal_unit", "MOBIT")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .param("tender_id", tenderId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("duplicate"))
                .andExpect(jsonPath("$.file_path").value(filePath));

        org.junit.jupiter.api.Assertions.assertEquals(
                2,
                jdbcTemplate.queryForObject(
                        "select count(*) from documents where tender_id=?",
                        Integer.class,
                        tenderId));
        org.junit.jupiter.api.Assertions.assertEquals(
                1,
                jdbcTemplate.queryForObject(
                        "select count(*) from tenders where tender_id=?",
                        Integer.class,
                        tenderId));
        org.junit.jupiter.api.Assertions.assertEquals(
                1,
                jdbcTemplate.queryForObject(
                        "select count(*) from tender_organizations where code='BEDAS'",
                        Integer.class));

        Path tenderNote = Path.of(
                        "target", "test-vault", "ihaleler", "2026", "MOBIT",
                        "BEDAS", tenderId, tenderId + ".md")
                .toAbsolutePath()
                .normalize();
        String note = Files.readString(tenderNote, StandardCharsets.UTF_8);
        org.junit.jupiter.api.Assertions.assertTrue(
                note.contains("<!-- AUTO:DOCUMENTS:START -->"));
        org.junit.jupiter.api.Assertions.assertTrue(note.contains("[[documents/"));
    }

    @Test
    void uploadRejectsInvalidContentAndEmployeeAccess() throws Exception {
        String adminToken = loginAdmin();
        MockMultipartFile invalidPdf = new MockMultipartFile(
                "file",
                "invalid.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                "not a pdf".getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/dashboard/upload")
                        .file(invalidPdf)
                        .param("internal_unit", "MOBIT")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "File content does not match its declared type"));

        String employeeToken = createApprovedEmployee();
        MockMultipartFile employeeFile = new MockMultipartFile(
                "file",
                "valid.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                "%PDF-1.7\nvalid".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/dashboard/upload")
                        .file(employeeFile)
                        .param("internal_unit", "MOBIT")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        org.junit.jupiter.api.Assertions.assertEquals(
                0,
                jdbcTemplate.queryForObject("select count(*) from documents", Integer.class));
    }

    @Test
    void adminReadsTenderMetadataFilesTreeAndVault() throws Exception {
        byte[] fileBytes = "tender file bytes".getBytes(StandardCharsets.UTF_8);
        Path file = Path.of("target", "test-data", "originals", "2026", "MOBIT", "BEDAS", "sample.txt")
                .toAbsolutePath()
                .normalize();
        String treeFilePath = Path.of("target", "test-data")
                .toAbsolutePath()
                .normalize()
                .relativize(file)
                .toString()
                .replace('\\', '/');
        Files.createDirectories(file.getParent());
        Files.write(file, fileBytes);

        Path note = Path.of("target", "test-vault", "ihaleler", "2026", "BEDAS", "BEDAS-2026-001.md")
                .toAbsolutePath()
                .normalize();
        Files.createDirectories(note.getParent());
        Files.writeString(note, "---\ntags: [bedas, ihale]\n---\n[[sample.txt]]", StandardCharsets.UTF_8);

        jdbcTemplate.update("""
                insert into tenders
                    (tender_id, organization, year, sequence, internal_unit, title, status, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                "BEDAS-2026-001", "BEDAS", 2026, 1, "MOBIT",
                "Transformer Tender", "active", Timestamp.from(Instant.now()));
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id, mime_type,
                     original_filename, stored_filename, file_path, file_size, internal_unit,
                     organization, year, tender_id, document_type, status, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                "message-1", "hashed-sender", "telegram", Timestamp.from(Instant.now()),
                "media-1", "text/plain", "sample.txt", "sample.txt", file.toString(),
                fileBytes.length, "MOBIT", "BEDAS", 2026, "BEDAS-2026-001",
                "technical_spec", "stored", Timestamp.from(Instant.now()));
        Long documentId = jdbcTemplate.queryForObject(
                "select id from documents where message_id='message-1'",
                Long.class);
        jdbcTemplate.update(
                """
                update documents
                   set extracted_text=?,
                       text_extraction_status='extracted'
                 where id=?
                """,
                "Transformer Tender contains pole mounted transformer, guarantee table and field service scope.",
                documentId);
        String adminToken = loginAdmin();

        mockMvc.perform(get("/documents")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sender_hash").value("hashed-sender"))
                .andExpect(jsonPath("$[0].tender_id").value("BEDAS-2026-001"));

        mockMvc.perform(get("/documents/page")
                        .queryParam("offset", "0")
                        .queryParam("limit", "1")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(1))
                .andExpect(jsonPath("$.page.offset").value(0))
                .andExpect(jsonPath("$.page.limit").value(1))
                .andExpect(jsonPath("$.page.has_next").value(false))
                .andExpect(jsonPath("$.items[0].tender_id").value("BEDAS-2026-001"));

        mockMvc.perform(get("/documents/search")
                        .queryParam("q", "transformer guarantee")
                        .queryParam("organization", "BEDAS")
                        .queryParam("limit", "5")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.results[0].id").value(documentId))
                .andExpect(jsonPath("$.results[0].tender_id").value("BEDAS-2026-001"))
                .andExpect(jsonPath("$.results[0].snippet").value(containsString("Transformer Tender")));

        mockMvc.perform(get("/documents/search")
                        .queryParam("tender_id", "BEDAS-2026-001")
                        .queryParam("document_type", "technical_spec")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.results[0].original_filename").value("sample.txt"));

        mockMvc.perform(get("/documents/facets")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organizations[0].value").value("BEDAS"))
                .andExpect(jsonPath("$.years[0].value").value("2026"))
                .andExpect(jsonPath("$.internal_units[0].value").value("MOBIT"))
                .andExpect(jsonPath("$.document_types[0].value").value("technical_spec"))
                .andExpect(jsonPath("$.statuses[0].value").value("stored"))
                .andExpect(jsonPath("$.timestamp_min").exists())
                .andExpect(jsonPath("$.timestamp_max").exists());

        mockMvc.perform(get("/tenders/BEDAS-2026-001")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Transformer Tender"));

        mockMvc.perform(get("/tenders/page")
                        .queryParam("offset", "0")
                        .queryParam("limit", "1")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.total").value(1))
                .andExpect(jsonPath("$.items[0].tender_id").value("BEDAS-2026-001"));

        mockMvc.perform(get("/dashboard/files/{documentId}", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/dashboard/files/{documentId}/view", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/dashboard/tree-file")
                        .queryParam("root_key", "data")
                        .queryParam("path", treeFilePath)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        """
                        select count(*) from auth_audit_events
                        where event_type='admin_file_download'
                          and subject_type='tender_document'
                          and subject_id=?
                        """,
                        Long.class,
                        documentId.toString()));
        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        """
                        select count(*) from auth_audit_events
                        where event_type='admin_file_view'
                          and subject_type='tender_document'
                          and subject_id=?
                        """,
                        Long.class,
                        documentId.toString()));
        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        """
                        select count(*) from auth_audit_events
                        where event_type='admin_file_view'
                          and subject_type='dashboard_tree_file'
                          and subject_id=?
                        """,
                        Long.class,
                        "data:" + treeFilePath));

        String taskResponse = mockMvc.perform(post("/erp/tasks/from-document/{documentId}", documentId)
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Review transformer tender document",
                                  "description":"Validate the technical specification",
                                  "priority":"high"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.status").value("todo"))
                .andExpect(jsonPath("$.document.document_id").value(documentId))
                .andReturn().getResponse().getContentAsString();
        long taskDocumentId = ((Number) JsonPath.read(taskResponse, "$.document.id")).longValue();

        mockMvc.perform(get("/erp/task-documents/{documentId}/content", taskDocumentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(fileBytes));

        mockMvc.perform(get("/dashboard/tree")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data_originals.type").value("folder"))
                .andExpect(jsonPath("$.obsidian_vault.type").value("folder"))
                .andExpect(content().string(containsString("/dashboard/tree-file?")));

        mockMvc.perform(get("/dashboard/vault/notes")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes[0].linked_files").value(1))
                .andExpect(jsonPath("$.notes[0].tags[0]").value("2026"));

        mockMvc.perform(get("/dashboard/vault/note")
                        .queryParam("path", "2026/BEDAS/BEDAS-2026-001.md")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value(containsString("[[sample.txt]]")));

        mockMvc.perform(get("/dashboard/tree-file")
                        .queryParam("root_key", "data")
                        .queryParam("path", "../pom.xml")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminExtractsTextFromOfficeTenderDocument() throws Exception {
        String adminToken = loginAdmin();
        MockMultipartFile docx = new MockMultipartFile(
                "file",
                "technical-specification.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                minimalDocx("""
                        Tender technical specification motor power schedule.
                        Son teklif tarihi 15.07.2026 ve teminat 125.000,50 TL.
                        Contact ops@example.com for clarification.
                        """));

        String uploadResponse = mockMvc.perform(multipart("/dashboard/upload")
                        .file(docx)
                        .param("internal_unit", "MOBIT")
                        .param("organization", "BEDAS")
                        .param("year", "2026")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text_extraction_status").value("pending"))
                .andReturn().getResponse().getContentAsString();
        long documentId = ((Number) JsonPath.read(uploadResponse, "$.id")).longValue();

        mockMvc.perform(post("/documents/{documentId}/extract-text", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text_extraction_status").value("extracted"))
                .andExpect(jsonPath("$.extracted_text").value(containsString(
                        "Tender technical specification")));

        mockMvc.perform(get("/documents/{documentId}/extracted-text", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.extracted_text").value(containsString(
                        "motor power schedule")));

        org.junit.jupiter.api.Assertions.assertTrue(
                jdbcTemplate.queryForObject(
                        "select extracted_text from documents where id=?",
                        String.class,
                        documentId).contains("motor power schedule"));

        mockMvc.perform(post("/documents/{documentId}/extract-facts", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fact_extraction_status").value("extracted"))
                .andExpect(jsonPath("$.facts.metadata.tender_id").exists())
                .andExpect(jsonPath("$.facts.dates[0].normalized").value("2026-07-15"))
                .andExpect(jsonPath("$.facts.deadline_candidates[0].normalized").value("2026-07-15"))
                .andExpect(jsonPath("$.facts.money_amounts[0].amount").value("125000.5"))
                .andExpect(jsonPath("$.facts.emails[0]").value("ops@example.com"));

        mockMvc.perform(get("/documents/{documentId}/facts", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facts.money_amounts[0].currency").value("TRY"));

        mockMvc.perform(post("/documents/{documentId}/generate-summary", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ai_summary_status").value("generated"))
                .andExpect(jsonPath("$.summary.provider").value("deterministic-extractive-v1"))
                .andExpect(jsonPath("$.summary.tender_id").exists())
                .andExpect(jsonPath("$.summary.headline").value(containsString("teknik şartname")))
                .andExpect(jsonPath("$.summary.important_dates[0].normalized").value("2026-07-15"))
                .andExpect(jsonPath("$.summary.suggested_next_actions[0]").value(containsString("görev")));

        mockMvc.perform(get("/documents/{documentId}/summary", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.contacts[0]").value("ops@example.com"));

        mockMvc.perform(post("/documents/{documentId}/analyze-risks", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ai_risk_status").value("generated"))
                .andExpect(jsonPath("$.risk_analysis.provider").value("deterministic-risk-v1"))
                .andExpect(jsonPath("$.risk_analysis.risk_level").value("high"))
                .andExpect(jsonPath("$.risk_analysis.risks[0].category").value("missing_documents"))
                .andExpect(jsonPath("$.risk_analysis.risks[?(@.category == 'guarantee')]").exists());

        mockMvc.perform(get("/documents/{documentId}/risk-analysis", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.risk_analysis.risks[0].recommendation").exists());

        mockMvc.perform(post("/documents/{documentId}/suggest-task", documentId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value(containsString("teknik şartname")))
                .andExpect(jsonPath("$.priority").value("high"))
                .andExpect(jsonPath("$.deadline_at").value("2026-07-15T09:00:00Z"))
                .andExpect(jsonPath("$.rationale").value(containsString("deadline")));
    }

    @Test
    void tenderHubRequiresAdminRole() throws Exception {
        String employeeToken = createApprovedEmployee();

        mockMvc.perform(get("/documents")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/documents/search")
                        .queryParam("q", "transformer")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/documents/facets")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/documents/page")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/dashboard/tree")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/erp/tasks/from-document/1")
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Forbidden task\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/tenders"))
                .andExpect(status().isUnauthorized());
    }

    private EmployeeLogin createApprovedEmployee(String name, String email) throws Exception {
        String request = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"%s",
                                  "email":"%s",
                                  "password":"StrongPass123!"
                                }
                                """.formatted(name, email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long requestId = ((Number) JsonPath.read(request, "$.id")).longValue();
        String approveResponse = mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", bearer(loginAdmin())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long userId = ((Number) JsonPath.read(approveResponse, "$.id")).longValue();
        String login = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email":"%s",
                                  "password":"StrongPass123!"
                                }
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new EmployeeLogin(userId, JsonPath.read(login, "$.access_token"));
    }

    private String createApprovedEmployee() throws Exception {
        return createApprovedEmployee(
                "Tender Employee",
                "tender.employee@example.com").token();
    }

    private long sendGroupText(String token, long groupId, String body) throws Exception {
        String response = mockMvc.perform(post("/document-groups/{groupId}/messages", groupId)
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"body":"%s"}
                                """.formatted(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private record EmployeeLogin(long userId, String token) {
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

    private void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private byte[] minimalDocx(String text) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            zipEntry(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                    </Types>
                    """);
            zipEntry(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                    </Relationships>
                    """);
            zipEntry(zip, "word/document.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:body>
                    </w:document>
                    """.formatted(text));
        }
        return bytes.toByteArray();
    }

    private void zipEntry(ZipOutputStream zip, String name, String content) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
