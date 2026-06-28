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

    public DocumentGroupController(DocumentGroupService service) {
        this.service = service;
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

    @GetMapping("/{groupId}/messages")
    List<DocumentGroupMessageResponse> messages(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId
    ) {
        return service.listMessages(ErpPrincipal.from(authentication), groupId).stream()
                .map(DocumentGroupMessageResponse::from)
                .toList();
    }

    @PostMapping("/{groupId}/messages")
    DocumentGroupMessageResponse sendMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return DocumentGroupMessageResponse.from(service.sendMessage(
                ErpPrincipal.from(authentication),
                groupId,
                request.body(),
                request.messageKind(),
                request.mediaMimeType(),
                request.mediaData(),
                request.mediaDurationMs()));
    }

    @DeleteMapping("/{groupId}/messages/{messageId}")
    ResponseEntity<Void> deleteMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long groupId,
            @PathVariable long messageId
    ) {
        service.deleteMessage(ErpPrincipal.from(authentication), groupId, messageId);
        return ResponseEntity.noContent().build();
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
            @JsonProperty("media_duration_ms") Integer mediaDurationMs
    ) {
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
            @JsonProperty("document_count") long documentCount
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
                    value.documentCount());
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

    record DocumentGroupMessageResponse(
            Long id,
            @JsonProperty("group_id") Long groupId,
            @JsonProperty("author_user_id") Long authorUserId,
            @JsonProperty("author_name") String authorName,
            String body,
            @JsonProperty("message_kind") String messageKind,
            @JsonProperty("media_mime_type") String mediaMimeType,
            @JsonProperty("media_data") String mediaData,
            @JsonProperty("media_duration_ms") Integer mediaDurationMs,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static DocumentGroupMessageResponse from(DocumentGroupMessage message) {
            return new DocumentGroupMessageResponse(
                    message.getId(),
                    message.getGroupId(),
                    message.getAuthorUserId(),
                    message.getAuthorName(),
                    message.getBody(),
                    message.getMessageKind(),
                    message.getMediaMimeType(),
                    message.getMediaData(),
                    message.getMediaDurationMs(),
                    message.getCreatedAt());
        }
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
