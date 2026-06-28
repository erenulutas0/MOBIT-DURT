package com.docsbot.ops.tender;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.tender.domain.DocumentGroup;
import com.docsbot.ops.tender.domain.DocumentGroupDocument;
import com.docsbot.ops.tender.domain.DocumentGroupMember;
import com.docsbot.ops.tender.domain.DocumentGroupMessage;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.DocumentGroupDocumentRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMemberRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupRepository;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import com.docsbot.ops.tender.infrastructure.TenderRepository;

@Service
@Profile("postgres")
public class DocumentGroupService {

    private static final String DEFAULT_INTERNAL_UNIT = "MOBIT";
    private static final String DEFAULT_ORGANIZATION = "DOC_GROUP";
    private static final String OWNER_ROLE = "OWNER";
    private static final String MEMBER_ROLE = "MEMBER";

    private final DocumentGroupRepository groupRepository;
    private final DocumentGroupMemberRepository memberRepository;
    private final DocumentGroupDocumentRepository groupDocumentRepository;
    private final DocumentGroupMessageRepository messageRepository;
    private final TenderDocumentRepository documentRepository;
    private final TenderRepository tenderRepository;
    private final ErpUserRepository userRepository;
    private final TenderIngestionService ingestionService;
    private final DashboardFileService fileService;
    private final Clock clock;

    @Autowired
    public DocumentGroupService(
            DocumentGroupRepository groupRepository,
            DocumentGroupMemberRepository memberRepository,
            DocumentGroupDocumentRepository groupDocumentRepository,
            DocumentGroupMessageRepository messageRepository,
            TenderDocumentRepository documentRepository,
            TenderRepository tenderRepository,
            ErpUserRepository userRepository,
            TenderIngestionService ingestionService,
            DashboardFileService fileService
    ) {
        this(
                groupRepository,
                memberRepository,
                groupDocumentRepository,
                messageRepository,
                documentRepository,
                tenderRepository,
                userRepository,
                ingestionService,
                fileService,
                Clock.systemUTC());
    }

    DocumentGroupService(
            DocumentGroupRepository groupRepository,
            DocumentGroupMemberRepository memberRepository,
            DocumentGroupDocumentRepository groupDocumentRepository,
            DocumentGroupMessageRepository messageRepository,
            TenderDocumentRepository documentRepository,
            TenderRepository tenderRepository,
            ErpUserRepository userRepository,
            TenderIngestionService ingestionService,
            DashboardFileService fileService,
            Clock clock
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.groupDocumentRepository = groupDocumentRepository;
        this.messageRepository = messageRepository;
        this.documentRepository = documentRepository;
        this.tenderRepository = tenderRepository;
        this.userRepository = userRepository;
        this.ingestionService = ingestionService;
        this.fileService = fileService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<DocumentGroupSummary> listGroups(ErpPrincipal principal) {
        List<DocumentGroup> groups = principal.admin() || hasDocumentNetworkVisibility(principal)
                ? groupRepository.findAllByArchivedAtIsNullOrderByUpdatedAtDescIdDesc()
                : memberRepository.findAllByUserIdOrderByCreatedAtDescIdDesc(principal.requireUserId()).stream()
                        .map(member -> groupRepository.findById(member.getGroupId()).orElse(null))
                        .filter(group -> group != null && group.getArchivedAt() == null)
                        .sorted(Comparator.comparing(DocumentGroup::getUpdatedAt).reversed())
                        .toList();
        return groups.stream().map(this::summary).toList();
    }

    @Transactional
    public DocumentGroupSummary createGroup(
            ErpPrincipal principal,
            String name,
            String description,
            String tenderId,
            Integer year,
            List<Long> memberUserIds
    ) {
        Instant now = clock.instant();
        DocumentGroup group = groupRepository.saveAndFlush(DocumentGroup.create(
                normalizeName(name),
                description,
                normalizeOptionalTenderId(tenderId),
                normalizeYear(year),
                principal.subject(),
                now));
        if (principal.userId().isPresent()) {
            memberRepository.save(DocumentGroupMember.create(
                    group.getId(),
                    principal.userId().getAsLong(),
                    OWNER_ROLE,
                    principal.subject(),
                    now));
        }
        for (Long userId : normalizeMemberIds(memberUserIds)) {
            addMemberInternal(group, userId, MEMBER_ROLE, principal.subject(), now);
        }
        return summary(group);
    }

    @Transactional(readOnly = true)
    public DocumentGroupDetail getGroup(ErpPrincipal principal, long groupId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        return detail(group);
    }

    @Transactional
    public DocumentGroupDetail updateGroup(
            ErpPrincipal principal,
            long groupId,
            String name,
            String description,
            String tenderId,
            Integer year,
            boolean transferExistingDocuments
    ) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        String effectiveTenderId = normalizeOptionalTenderId(tenderId);
        Integer effectiveYear = normalizeYear(year);
        group.update(normalizeName(name), description, effectiveTenderId, effectiveYear, clock.instant());
        if (transferExistingDocuments && effectiveTenderId != null) {
            rerouteExistingDocuments(group, effectiveTenderId, effectiveYear);
        }
        return detail(group);
    }

    @Transactional
    public DocumentGroupDetail setArchived(ErpPrincipal principal, long groupId, boolean archived) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        group.setArchived(archived, clock.instant());
        return detail(group);
    }

    @Transactional
    public DocumentGroupDetail addMember(
            ErpPrincipal principal,
            long groupId,
            long userId,
            String role
    ) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        addMemberInternal(group, userId, normalizeRole(role), principal.subject(), clock.instant());
        return detail(group);
    }

    @Transactional
    public DocumentGroupDetail removeMember(ErpPrincipal principal, long groupId, long userId) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        memberRepository.deleteByGroupIdAndUserId(groupId, userId);
        return detail(group);
    }

    @Transactional
    public GroupDocumentItem uploadDocument(
            ErpPrincipal principal,
            long groupId,
            MultipartFile file,
            String note,
            String tenderId,
            Integer year
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        if (group.getArchivedAt() != null) {
            throw new ErpExceptions.BadRequest("Document group is archived");
        }
        String effectiveTenderId = normalizeOptionalTenderId(tenderId);
        if (effectiveTenderId == null) {
            effectiveTenderId = group.getTenderId();
        }
        Integer effectiveYear = normalizeYear(year);
        if (effectiveYear == null) {
            effectiveYear = group.getYear();
        }
        if (effectiveYear == null) {
            effectiveYear = LocalDate.now(ZoneOffset.UTC).getYear();
        }
        String internalUnit = DEFAULT_INTERNAL_UNIT;
        String organization = DEFAULT_ORGANIZATION;
        if (effectiveTenderId != null) {
            Tender tender = tenderRepository.findByTenderId(effectiveTenderId)
                    .orElseThrow(() -> new ErpExceptions.BadRequest("Tender not found"));
            internalUnit = tender.getInternalUnit();
            organization = tender.getOrganization();
            effectiveYear = tender.getYear();
        }

        TenderDocument document = ingestionService.upload(
                file,
                internalUnit,
                organization,
                effectiveYear,
                effectiveTenderId,
                note);
        DocumentGroupDocument mapping = groupDocumentRepository.saveAndFlush(
                DocumentGroupDocument.create(
                        group.getId(),
                        document.getId(),
                        principal.userId().isPresent() ? principal.userId().getAsLong() : null,
                        principal.displayName(),
                        note,
                        effectiveTenderId,
                        effectiveYear,
                        clock.instant()));
        group.touch(clock.instant());
        return new GroupDocumentItem(mapping, document);
    }

    @Transactional(readOnly = true)
    public List<GroupDocumentItem> listDocuments(ErpPrincipal principal, long groupId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        return groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(groupId).stream()
                .map(mapping -> new GroupDocumentItem(mapping, document(mapping.getDocumentId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DocumentGroupMessage> listMessages(ErpPrincipal principal, long groupId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        return messageRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(groupId);
    }

    @Transactional
    public DocumentGroupMessage sendMessage(
            ErpPrincipal principal,
            long groupId,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        if (group.getArchivedAt() != null) {
            throw new ErpExceptions.BadRequest("Document group is archived");
        }
        String kind = normalizeMessageKind(messageKind);
        DocumentGroupMessage message = messageRepository.saveAndFlush(DocumentGroupMessage.create(
                group.getId(),
                principal.userId().isPresent() ? principal.userId().getAsLong() : null,
                principal.displayName(),
                "voice".equals(kind) ? "Ses mesajı" : normalizeMessageBody(body),
                kind,
                normalizeMessageMediaMimeType(kind, mediaMimeType),
                normalizeMessageMediaData(kind, mediaData),
                "voice".equals(kind) ? Math.max(0, mediaDurationMs == null ? 0 : mediaDurationMs) : null,
                clock.instant()));
        group.touch(clock.instant());
        return message;
    }

    @Transactional
    public void deleteMessage(ErpPrincipal principal, long groupId, long messageId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupMessage message = messageRepository.findById(messageId)
                .filter(value -> value.getGroupId() == groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message not found"));
        if (!canManage(principal, group) && !isCurrentUser(principal, message.getAuthorUserId())) {
            throw new ErpExceptions.Forbidden("Message owner or group manager access is required");
        }
        messageRepository.delete(message);
        group.touch(clock.instant());
    }

    @Transactional
    public void deleteDocument(ErpPrincipal principal, long groupId, long groupDocumentId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupDocument mapping = groupDocumentRepository.findByIdAndGroupId(groupDocumentId, groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Group document not found"));
        if (!canManage(principal, group) && !isCurrentUser(principal, mapping.getUploadedByUserId())) {
            throw new ErpExceptions.Forbidden("Document owner or group manager access is required");
        }
        groupDocumentRepository.delete(mapping);
        group.touch(clock.instant());
    }

    @Transactional(readOnly = true)
    public DashboardFileService.StoredFile groupDocumentFile(
            ErpPrincipal principal,
            long groupId,
            long groupDocumentId
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupDocument mapping = groupDocumentRepository.findByIdAndGroupId(groupDocumentId, groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Group document not found"));
        return fileService.documentFile(mapping.getDocumentId());
    }

    private DocumentGroupSummary summary(DocumentGroup group) {
        long memberCount = memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).size();
        long documentCount = groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(group.getId()).size();
        return new DocumentGroupSummary(group, memberCount, documentCount);
    }

    private DocumentGroupDetail detail(DocumentGroup group) {
        List<DocumentGroupMemberItem> members = memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).stream()
                .map(member -> new DocumentGroupMemberItem(member, userRepository.findById(member.getUserId()).orElse(null)))
                .toList();
        List<GroupDocumentItem> documents = groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(group.getId()).stream()
                .map(mapping -> new GroupDocumentItem(mapping, document(mapping.getDocumentId())))
                .toList();
        return new DocumentGroupDetail(summary(group), members, documents);
    }

    private void addMemberInternal(
            DocumentGroup group,
            long userId,
            String role,
            String addedBy,
            Instant now
    ) {
        userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("User not found"));
        memberRepository.findByGroupIdAndUserId(group.getId(), userId)
                .ifPresentOrElse(
                        member -> member.updateRole(role),
                        () -> memberRepository.save(DocumentGroupMember.create(
                                group.getId(),
                                userId,
                                role,
                                addedBy,
                                now)));
    }

    private DocumentGroup group(long groupId) {
        return groupRepository.findById(groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document group not found"));
    }

    private TenderDocument document(long documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    private void rerouteExistingDocuments(DocumentGroup group, String tenderId, Integer year) {
        Tender tender = tenderRepository.findByTenderId(tenderId)
                .orElseThrow(() -> new ErpExceptions.BadRequest("Workflow company not found"));
        Integer targetYear = year == null ? tender.getYear() : year;
        for (DocumentGroupDocument mapping : groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(group.getId())) {
            mapping.reroute(tenderId, targetYear);
            TenderDocument document = document(mapping.getDocumentId());
            document.reroute(tender.getInternalUnit(), tender.getOrganization(), targetYear, tenderId);
        }
    }

    private void requireView(ErpPrincipal principal, DocumentGroup group) {
        if (principal.admin()) return;
        if (hasDocumentNetworkVisibility(principal)) return;
        if (memberRepository.existsByGroupIdAndUserId(group.getId(), principal.requireUserId())) return;
        throw new ErpExceptions.Forbidden("Document group access is required");
    }

    private void requireManage(ErpPrincipal principal, DocumentGroup group) {
        if (canManage(principal, group)) return;
        throw new ErpExceptions.Forbidden("Document group manager access is required");
    }

    private boolean canManage(ErpPrincipal principal, DocumentGroup group) {
        if (principal.admin()) return true;
        if (principal.userId().isEmpty()) return false;
        return memberRepository.findByGroupIdAndUserId(group.getId(), principal.userId().getAsLong())
                .map(member -> OWNER_ROLE.equals(member.getRole()))
                .orElse(false);
    }

    private boolean isCurrentUser(ErpPrincipal principal, Long userId) {
        return userId != null
                && principal.userId().isPresent()
                && principal.userId().getAsLong() == userId;
    }

    private String normalizeName(String name) {
        if (name == null || name.isBlank()) {
            throw new ErpExceptions.BadRequest("Group name is required");
        }
        return name.trim();
    }

    private boolean hasDocumentNetworkVisibility(ErpPrincipal principal) {
        return principal.userId().isPresent()
                && userRepository.findById(principal.userId().getAsLong())
                        .map(ErpUser::isDocumentNetworkVisible)
                        .orElse(false);
    }

    private String normalizeOptionalTenderId(String tenderId) {
        if (tenderId == null || tenderId.isBlank()) {
            return null;
        }
        String normalized = tenderId.trim();
        if (normalized.length() > 128) {
            throw new ErpExceptions.BadRequest("Tender id is too long");
        }
        return normalized;
    }

    private Integer normalizeYear(Integer year) {
        if (year == null) {
            return null;
        }
        int current = LocalDate.now(ZoneOffset.UTC).getYear();
        if (year < 2000 || year > current + 2) {
            throw new ErpExceptions.BadRequest("Document group year is invalid");
        }
        return year;
    }

    private String normalizeRole(String role) {
        String normalized = role == null ? MEMBER_ROLE : role.trim().toUpperCase(Locale.ROOT);
        return OWNER_ROLE.equals(normalized) ? OWNER_ROLE : MEMBER_ROLE;
    }

    private String normalizeMessageBody(String body) {
        if (body == null || body.isBlank()) {
            throw new ErpExceptions.BadRequest("Message body is required");
        }
        String normalized = body.trim();
        if (normalized.length() > 5_000) {
            throw new ErpExceptions.BadRequest("Message body is too long");
        }
        return normalized;
    }

    private String normalizeMessageKind(String value) {
        if (value == null || value.isBlank()) return "text";
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (!List.of("text", "voice").contains(normalized)) {
            throw new ErpExceptions.BadRequest("Unsupported message type");
        }
        return normalized;
    }

    private String normalizeMessageMediaMimeType(String kind, String value) {
        if (!"voice".equals(kind)) return null;
        if (value == null || value.isBlank()) return "audio/webm";
        String normalized = value.trim();
        if (!normalized.startsWith("audio/")) {
            throw new ErpExceptions.BadRequest("Voice message must be audio");
        }
        return normalized;
    }

    private String normalizeMessageMediaData(String kind, String value) {
        if (!"voice".equals(kind)) return null;
        if (value == null || value.isBlank() || !value.trim().startsWith("data:audio/")) {
            throw new ErpExceptions.BadRequest("Voice message data is required");
        }
        String normalized = value.trim();
        if (normalized.length() > 1_500_000) {
            throw new ErpExceptions.BadRequest("Voice message is too large");
        }
        return normalized;
    }

    private Set<Long> normalizeMemberIds(List<Long> memberUserIds) {
        return memberUserIds == null
                ? Set.of()
                : memberUserIds.stream()
                        .filter(id -> id != null && id > 0)
                        .collect(Collectors.toSet());
    }

    public record DocumentGroupSummary(
            DocumentGroup group,
            long memberCount,
            long documentCount
    ) {
    }

    public record DocumentGroupMemberItem(
            DocumentGroupMember member,
            ErpUser user
    ) {
    }

    public record GroupDocumentItem(
            DocumentGroupDocument mapping,
            TenderDocument document
    ) {
    }

    public record DocumentGroupDetail(
            DocumentGroupSummary summary,
            List<DocumentGroupMemberItem> members,
            List<GroupDocumentItem> documents
    ) {
    }
}
