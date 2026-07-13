package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.common.media.MessageMediaStorage;
import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.tender.domain.DocumentGroup;
import com.docsbot.ops.tender.domain.DocumentGroupDocument;
import com.docsbot.ops.tender.domain.DocumentGroupMember;
import com.docsbot.ops.tender.domain.DocumentGroupMessage;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/document-groups")
@Profile("postgres")
public class DocumentGroupController {

    private final DocumentGroupService service;
    private final MessageMediaStorage mediaStorage;

    public DocumentGroupController(DocumentGroupService service, MessageMediaStorage mediaStorage) {
        this.service = service;
        this.mediaStorage = mediaStorage;
    }

    @GetMapping
    List<DocumentGroupSummaryResponse> groups(JwtAuthenticationToken authentication) {
        return service.listGroups(ErpPrincipal.from(authentication)).stream()
                .map(DocumentGroupSummaryResponse::from)
                .toList();
    }

    @PostMapping
    DocumentGroupDetailResponse createGroup(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateGroupRequest request
    ) {
        DocumentGroupService.DocumentGroupSummary summary = service.createGroup(
                ErpPrincipal.from(authentication),
                request.name(),
                request.description(),
                request.tenderId(),
                request.year(),
                request.memberUserIds());
        return DocumentGroupDetailResponse.from(service.getGroup(
                ErpPrincipal.from(authentication),
                summary.group().getId()));
    }

    @GetMapping("/{groupId}")
    DocumentGroupDetailResponse group(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId
    ) {
        return DocumentGroupDetailResponse.from(service.getGroup(
                ErpPrincipal.from(authentication),
                groupId));
    }

    @PatchMapping("/{groupId}")
    DocumentGroupDetailResponse updateGroup(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody UpdateGroupRequest request
    ) {
        return DocumentGroupDetailResponse.from(service.updateGroup(
                ErpPrincipal.from(authentication),
                groupId,
                request.name(),
                request.description(),
                request.tenderId(),
                request.year(),
                request.transferExistingDocuments()));
    }

    @PatchMapping("/{groupId}/archive")
    DocumentGroupDetailResponse archiveGroup(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody ArchiveGroupRequest request
    ) {
        return DocumentGroupDetailResponse.from(service.setArchived(
                ErpPrincipal.from(authentication),
                groupId,
                request.archived()));
    }

    @PostMapping("/{groupId}/members")
    DocumentGroupDetailResponse addMember(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody AddMemberRequest request
    ) {
        return DocumentGroupDetailResponse.from(service.addMember(
                ErpPrincipal.from(authentication),
                groupId,
                request.userId(),
                request.role()));
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    DocumentGroupDetailResponse removeMember(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long userId
    ) {
        return DocumentGroupDetailResponse.from(service.removeMember(
                ErpPrincipal.from(authentication),
                groupId,
                userId));
    }

    @GetMapping("/{groupId}/documents")
    List<GroupDocumentResponse> documents(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId
    ) {
        return service.listDocuments(ErpPrincipal.from(authentication), groupId).stream()
                .map(GroupDocumentResponse::from)
                .toList();
    }

    @PostMapping(
            value = "/{groupId}/documents",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    GroupDocumentResponse uploadDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(name = "note", required = false) String note,
            @RequestParam(name = "tender_id", required = false) String tenderId,
            @RequestParam(name = "year", required = false) Integer year
    ) {
        return GroupDocumentResponse.from(service.uploadDocument(
                ErpPrincipal.from(authentication),
                groupId,
                file,
                note,
                tenderId,
                year));
    }

    @PostMapping(
            value = "/{groupId}/documents/{groupDocumentId}/versions",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    GroupDocumentResponse replaceDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long groupDocumentId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(name = "note", required = false) String note
    ) {
        return GroupDocumentResponse.from(service.replaceDocument(
                ErpPrincipal.from(authentication),
                groupId,
                groupDocumentId,
                file,
                note));
    }

    @GetMapping("/{groupId}/documents/{groupDocumentId}/versions")
    List<GroupDocumentVersionResponse> documentVersions(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long groupDocumentId
    ) {
        return service.listDocumentVersions(ErpPrincipal.from(authentication), groupId, groupDocumentId).stream()
                .map(GroupDocumentVersionResponse::from)
                .toList();
    }

    @GetMapping("/{groupId}/documents/{groupDocumentId}/content")
    ResponseEntity<Resource> documentContent(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long groupDocumentId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        DashboardFileService.StoredFile file = service.groupDocumentFile(
                ErpPrincipal.from(authentication),
                groupId,
                groupDocumentId);
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(file.filename())
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(new FileSystemResource(file.path()));
    }

    @GetMapping("/{groupId}/documents/{groupDocumentId}/versions/{versionId}/content")
    ResponseEntity<Resource> documentVersionContent(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long groupDocumentId,
            @PathVariable long versionId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        DashboardFileService.StoredFile file = service.groupDocumentVersionFile(
                ErpPrincipal.from(authentication),
                groupId,
                groupDocumentId,
                versionId);
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(file.filename())
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(new FileSystemResource(file.path()));
    }

    @GetMapping("/{groupId}/messages")
    List<DocumentGroupMessageResponse> messages(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "before_id", required = false) Long beforeId
    ) {
        List<DocumentGroupMessage> messages = limit == null && beforeId == null
                ? service.listMessages(ErpPrincipal.from(authentication), groupId)
                : service.listMessages(
                        ErpPrincipal.from(authentication),
                        groupId,
                        limit == null ? 50 : limit,
                        beforeId);
        return messages.stream()
                .map(this::messageResponse)
                .toList();
    }

    @PostMapping("/{groupId}/messages")
    DocumentGroupMessageResponse sendMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return messageResponse(service.sendMessage(
                ErpPrincipal.from(authentication),
                groupId,
                request.body(),
                request.messageKind(),
                request.mediaMimeType(),
                request.mediaData(),
                request.mediaDurationMs(),
                request.clientMessageId(),
                request.replyToMessageId()));
    }

    @PatchMapping("/{groupId}/messages/read-through")
    ReadThroughResponse markMessagesRead(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody ReadThroughRequest request
    ) {
        return new ReadThroughResponse(service.markMessagesRead(
                ErpPrincipal.from(authentication),
                groupId,
                request.throughMessageId()));
    }

    @DeleteMapping("/{groupId}/messages/{messageId}")
    ResponseEntity<Void> deleteMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long messageId,
            @RequestParam(name = "scope", required = false) String scope
    ) {
        service.deleteMessage(ErpPrincipal.from(authentication), groupId, messageId, scope);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{groupId}/messages/{messageId}/media")
    ResponseEntity<Resource> messageMedia(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long messageId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        MessageMediaStorage.StoredContent media = service.groupMessageMedia(
                ErpPrincipal.from(authentication),
                groupId,
                messageId);
        // Only render known-safe types inline; force attachment otherwise (see ErpController.messageMedia).
        boolean inline = !download && MessageMediaStorage.isInlineSafe(media.contentType());
        ContentDisposition disposition = (inline
                ? ContentDisposition.inline()
                : ContentDisposition.attachment())
                .filename(media.filename())
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(media.path()));
    }

    @DeleteMapping("/{groupId}/documents/{groupDocumentId}")
    ResponseEntity<Void> deleteDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long groupDocumentId
    ) {
        service.deleteDocument(ErpPrincipal.from(authentication), groupId, groupDocumentId);
        return ResponseEntity.noContent().build();
    }

    record CreateGroupRequest(
            @NotBlank @Size(min = 2, max = 160) String name,
            @Size(max = 5_000) String description,
            @JsonProperty("tender_id") @Size(max = 128) String tenderId,
            Integer year,
            @JsonProperty("member_user_ids") List<Long> memberUserIds
    ) {
    }

    record UpdateGroupRequest(
            @NotBlank @Size(min = 2, max = 160) String name,
            @Size(max = 5_000) String description,
            @JsonProperty("tender_id") @Size(max = 128) String tenderId,
            Integer year,
            @JsonProperty("transfer_existing_documents") boolean transferExistingDocuments
    ) {
    }

    record ArchiveGroupRequest(boolean archived) {
    }

    record AddMemberRequest(
            @JsonProperty("user_id") long userId,
            String role
    ) {
    }

    record SendMessageRequest(
            @Size(max = 5_000) String body,
            @JsonProperty("message_kind") String messageKind,
            @JsonProperty("media_mime_type") String mediaMimeType,
            @JsonProperty("media_data") String mediaData,
            @JsonProperty("media_duration_ms") Integer mediaDurationMs,
            @JsonProperty("client_message_id") String clientMessageId,
            @JsonProperty("reply_to_message_id") Long replyToMessageId
    ) {
    }

    record ReadThroughRequest(@JsonProperty("through_message_id") long throughMessageId) {
    }

    record ReadThroughResponse(@JsonProperty("updated_count") int updatedCount) {
    }

    record DocumentGroupSummaryResponse(
            Long id,
            String name,
            String description,
            @JsonProperty("tender_id") String tenderId,
            Integer year,
            @JsonProperty("created_by") String createdBy,
            @JsonProperty("archived_at") Instant archivedAt,
            @JsonProperty("created_at") Instant createdAt,
            @JsonProperty("updated_at") Instant updatedAt,
            @JsonProperty("member_count") long memberCount,
            @JsonProperty("document_count") long documentCount,
            @JsonProperty("unread_message_count") long unreadMessageCount
    ) {
        static DocumentGroupSummaryResponse from(DocumentGroupService.DocumentGroupSummary value) {
            DocumentGroup group = value.group();
            return new DocumentGroupSummaryResponse(
                    group.getId(),
                    group.getName(),
                    group.getDescription(),
                    group.getTenderId(),
                    group.getYear(),
                    group.getCreatedBy(),
                    group.getArchivedAt(),
                    group.getCreatedAt(),
                    group.getUpdatedAt(),
                    value.memberCount(),
                    value.documentCount(),
                    value.unreadMessageCount());
        }
    }

    record DocumentGroupMemberResponse(
            Long id,
            @JsonProperty("user_id") Long userId,
            String role,
            @JsonProperty("added_by") String addedBy,
            @JsonProperty("created_at") Instant createdAt,
            String name,
            String email
    ) {
        static DocumentGroupMemberResponse from(DocumentGroupService.DocumentGroupMemberItem value) {
            DocumentGroupMember member = value.member();
            ErpUser user = value.user();
            return new DocumentGroupMemberResponse(
                    member.getId(),
                    member.getUserId(),
                    member.getRole().toLowerCase(),
                    member.getAddedBy(),
                    member.getCreatedAt(),
                    user == null ? null : user.getName(),
                    user == null ? null : user.getEmail());
        }
    }

    record GroupDocumentResponse(
            Long id,
            @JsonProperty("group_id") Long groupId,
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("uploaded_by_user_id") Long uploadedByUserId,
            @JsonProperty("uploaded_by") String uploadedBy,
            String note,
            @JsonProperty("tender_id") String tenderId,
            Integer year,
            @JsonProperty("created_at") Instant createdAt,
            TenderDtos.DocumentResponse document
    ) {
        static GroupDocumentResponse from(DocumentGroupService.GroupDocumentItem value) {
            DocumentGroupDocument mapping = value.mapping();
            return new GroupDocumentResponse(
                    mapping.getId(),
                    mapping.getGroupId(),
                    mapping.getDocumentId(),
                    mapping.getUploadedByUserId(),
                    mapping.getUploadedBy(),
                    mapping.getNote(),
                    mapping.getTenderId(),
                    mapping.getYear(),
                    mapping.getCreatedAt(),
                    TenderDtos.DocumentResponse.from(value.document()));
        }
    }

    record GroupDocumentVersionResponse(
            Long id,
            @JsonProperty("group_document_id") Long groupDocumentId,
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("version_number") Integer versionNumber,
            @JsonProperty("uploaded_by_user_id") Long uploadedByUserId,
            @JsonProperty("uploaded_by") String uploadedBy,
            String note,
            @JsonProperty("created_at") Instant createdAt,
            TenderDtos.DocumentResponse document
    ) {
        static GroupDocumentVersionResponse from(DocumentGroupService.GroupDocumentVersionItem value) {
            return new GroupDocumentVersionResponse(
                    value.id(),
                    value.groupDocumentId(),
                    value.document().getId(),
                    value.versionNumber(),
                    value.uploadedByUserId(),
                    value.uploadedBy(),
                    value.note(),
                    value.createdAt(),
                    TenderDtos.DocumentResponse.from(value.document()));
        }
    }

    record DocumentGroupMessageResponse(
            Long id,
            @JsonProperty("group_id") Long groupId,
            @JsonProperty("author_user_id") Long authorUserId,
            @JsonProperty("author_name") String authorName,
            String body,
            @JsonProperty("message_kind") String messageKind,
            @JsonProperty("media_mime_type") String mediaMimeType,
            @JsonProperty("media_data") String mediaData,
            @JsonProperty("media_url") String mediaUrl,
            @JsonProperty("media_ref") String mediaRef,
            @JsonProperty("media_duration_ms") Integer mediaDurationMs,
            @JsonProperty("client_message_id") String clientMessageId,
            @JsonProperty("reply_to_message_id") Long replyToMessageId,
            @JsonProperty("delivered_at") Instant deliveredAt,
            @JsonProperty("sequence_no") Long sequenceNo,
            @JsonProperty("delivery_status") String deliveryStatus,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static DocumentGroupMessageResponse from(
                DocumentGroupMessage message,
                String mediaData,
                String mediaUrl,
                String mediaRef
        ) {
            return new DocumentGroupMessageResponse(
                    message.getId(),
                    message.getGroupId(),
                    message.getAuthorUserId(),
                    message.getAuthorName(),
                    message.getBody(),
                    message.getMessageKind(),
                    message.getMediaMimeType(),
                    mediaData,
                    mediaUrl,
                    mediaRef,
                    message.getMediaDurationMs(),
                    message.getClientMessageId(),
                    message.getReplyToMessageId(),
                    message.getDeliveredAt(),
                    message.getSequenceNo(),
                    message.getDeliveredAt() != null ? "delivered" : "sent",
                    message.getCreatedAt());
        }
    }

    private DocumentGroupMessageResponse messageResponse(DocumentGroupMessage message) {
        String mediaRef = mediaStorage.reference(message.getMediaData());
        return DocumentGroupMessageResponse.from(
                message,
                mediaRef == null ? mediaStorage.toDataUrl(message.getMediaData(), message.getMediaMimeType()) : null,
                mediaRef == null ? null : "/document-groups/" + message.getGroupId() + "/messages/" + message.getId() + "/media",
                mediaRef);
    }

    record DocumentGroupDetailResponse(
            DocumentGroupSummaryResponse group,
            List<DocumentGroupMemberResponse> members,
            List<GroupDocumentResponse> documents
    ) {
        static DocumentGroupDetailResponse from(DocumentGroupService.DocumentGroupDetail value) {
            return new DocumentGroupDetailResponse(
                    DocumentGroupSummaryResponse.from(value.summary()),
                    value.members().stream().map(DocumentGroupMemberResponse::from).toList(),
                    value.documents().stream().map(GroupDocumentResponse::from).toList());
        }
    }
}
