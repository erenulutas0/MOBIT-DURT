package com.docsbot.ops.tender;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import org.springframework.dao.DataIntegrityViolationException;

import com.docsbot.ops.common.media.MessageMediaStorage;
import com.docsbot.ops.common.tx.NewTransactionExecutor;
import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.ChatEventPublisher;
import com.docsbot.ops.erp.application.NotificationService;
import com.docsbot.ops.tender.domain.DocumentGroup;
import com.docsbot.ops.tender.domain.DocumentGroupDocument;
import com.docsbot.ops.tender.domain.DocumentGroupMember;
import com.docsbot.ops.tender.domain.DocumentGroupMessage;
import com.docsbot.ops.tender.domain.DocumentGroupMessageHiddenReceipt;
import com.docsbot.ops.tender.domain.DocumentGroupMessageReadReceipt;
import com.docsbot.ops.tender.domain.DocumentGroupDocumentVersion;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.DocumentGroupDocumentRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupDocumentVersionRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMemberRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageHiddenReceiptRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageReadReceiptRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupRepository;
import com.docsbot.ops.tender.infrastructure.GroupCount;
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
    private final DocumentGroupDocumentVersionRepository groupDocumentVersionRepository;
    private final DocumentGroupMessageRepository messageRepository;
    private final DocumentGroupMessageHiddenReceiptRepository messageHiddenReceiptRepository;
    private final DocumentGroupMessageReadReceiptRepository messageReadReceiptRepository;
    private final TenderDocumentRepository documentRepository;
    private final TenderRepository tenderRepository;
    private final ErpUserRepository userRepository;
    private final TenderIngestionService ingestionService;
    private final DashboardFileService fileService;
    private final NotificationService notificationService;
    private final MessageMediaStorage mediaStorage;
    private final ChatEventPublisher chatEventPublisher;
    private final NewTransactionExecutor newTransactionExecutor;
    private final Clock clock;

    @Autowired
    public DocumentGroupService(
            DocumentGroupRepository groupRepository,
            DocumentGroupMemberRepository memberRepository,
            DocumentGroupDocumentRepository groupDocumentRepository,
            DocumentGroupDocumentVersionRepository groupDocumentVersionRepository,
            DocumentGroupMessageRepository messageRepository,
            DocumentGroupMessageHiddenReceiptRepository messageHiddenReceiptRepository,
            DocumentGroupMessageReadReceiptRepository messageReadReceiptRepository,
            TenderDocumentRepository documentRepository,
            TenderRepository tenderRepository,
            ErpUserRepository userRepository,
            TenderIngestionService ingestionService,
            DashboardFileService fileService,
            NotificationService notificationService,
            MessageMediaStorage mediaStorage,
            ChatEventPublisher chatEventPublisher,
            NewTransactionExecutor newTransactionExecutor
    ) {
        this(
                groupRepository,
                memberRepository,
                groupDocumentRepository,
                groupDocumentVersionRepository,
                messageRepository,
                messageHiddenReceiptRepository,
                messageReadReceiptRepository,
                documentRepository,
                tenderRepository,
                userRepository,
                ingestionService,
                fileService,
                notificationService,
                mediaStorage,
                chatEventPublisher,
                newTransactionExecutor,
                Clock.systemUTC());
    }

    DocumentGroupService(
            DocumentGroupRepository groupRepository,
            DocumentGroupMemberRepository memberRepository,
            DocumentGroupDocumentRepository groupDocumentRepository,
            DocumentGroupDocumentVersionRepository groupDocumentVersionRepository,
            DocumentGroupMessageRepository messageRepository,
            DocumentGroupMessageHiddenReceiptRepository messageHiddenReceiptRepository,
            DocumentGroupMessageReadReceiptRepository messageReadReceiptRepository,
            TenderDocumentRepository documentRepository,
            TenderRepository tenderRepository,
            ErpUserRepository userRepository,
            TenderIngestionService ingestionService,
            DashboardFileService fileService,
            NotificationService notificationService,
            MessageMediaStorage mediaStorage,
            ChatEventPublisher chatEventPublisher,
            NewTransactionExecutor newTransactionExecutor,
            Clock clock
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.groupDocumentRepository = groupDocumentRepository;
        this.groupDocumentVersionRepository = groupDocumentVersionRepository;
        this.messageRepository = messageRepository;
        this.messageHiddenReceiptRepository = messageHiddenReceiptRepository;
        this.messageReadReceiptRepository = messageReadReceiptRepository;
        this.documentRepository = documentRepository;
        this.tenderRepository = tenderRepository;
        this.userRepository = userRepository;
        this.ingestionService = ingestionService;
        this.fileService = fileService;
        this.notificationService = notificationService;
        this.mediaStorage = mediaStorage;
        this.chatEventPublisher = chatEventPublisher;
        this.newTransactionExecutor = newTransactionExecutor;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<DocumentGroupSummary> listGroups(ErpPrincipal principal) {
        List<DocumentGroup> groups;
        if (principal.admin() || hasDocumentNetworkVisibility(principal)) {
            groups = groupRepository.findAllByArchivedAtIsNullOrderByUpdatedAtDescIdDesc();
        } else {
            List<Long> groupIds = memberRepository.findAllByUserIdOrderByCreatedAtDescIdDesc(principal.requireUserId())
                    .stream()
                    .map(DocumentGroupMember::getGroupId)
                    .distinct()
                    .toList();
            groups = groupIds.isEmpty()
                    ? List.of()
                    : groupRepository.findAllByIdInAndArchivedAtIsNullOrderByUpdatedAtDescIdDesc(groupIds);
        }
        return summaries(groups, principal);
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
        return summary(group, principal);
    }

    @Transactional(readOnly = true)
    public DocumentGroupDetail getGroup(ErpPrincipal principal, long groupId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        return detail(group, principal);
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
        return detail(group, principal);
    }

    @Transactional
    public DocumentGroupDetail setArchived(ErpPrincipal principal, long groupId, boolean archived) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        group.setArchived(archived, clock.instant());
        return detail(group, principal);
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
        Instant now = clock.instant();
        addMemberInternal(group, userId, normalizeRole(role), principal.subject(), now);
        group.touch(now);
        notifyGroupMembers(
                group,
                principal,
                "document_group_member_added",
                "Oda üyesi eklendi",
                userName(userId) + " · " + group.getName(),
                "document-group-member-added:" + group.getId() + ":" + userId,
                now);
        return detail(group, principal);
    }

    @Transactional
    public DocumentGroupDetail removeMember(ErpPrincipal principal, long groupId, long userId) {
        DocumentGroup group = group(groupId);
        requireManage(principal, group);
        Instant now = clock.instant();
        memberRepository.deleteByGroupIdAndUserId(groupId, userId);
        group.touch(now);
        notificationService.notifyUsers(
                List.of(userId),
                "document_group_member_removed",
                "Oda üyeliğiniz kaldırıldı",
                group.getName(),
                null,
                "NORMAL",
                "document-group-member-removed:" + group.getId() + ":" + userId,
                now);
        notifyGroupMembers(
                group,
                principal,
                "document_group_member_removed",
                "Oda üyesi çıkarıldı",
                userName(userId) + " · " + group.getName(),
                "document-group-member-removed:" + group.getId() + ":" + userId + ":members",
                now);
        return detail(group, principal);
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
        Instant now = clock.instant();
        groupDocumentVersionRepository.save(DocumentGroupDocumentVersion.create(
                mapping.getId(),
                document.getId(),
                1,
                mapping.getUploadedByUserId(),
                mapping.getUploadedBy(),
                note,
                now));
        group.touch(now);
        notifyGroupMembers(
                group,
                principal,
                "document_group_document_uploaded",
                "Yeni doküman paylaşıldı",
                group.getName() + " · " + documentName(document),
                "document-group-document-uploaded:" + group.getId() + ":" + mapping.getId(),
                now);
        return new GroupDocumentItem(mapping, document);
    }

    @Transactional
    public GroupDocumentItem replaceDocument(
            ErpPrincipal principal,
            long groupId,
            long groupDocumentId,
            MultipartFile file,
            String note
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        if (group.getArchivedAt() != null) {
            throw new ErpExceptions.BadRequest("Document group is archived");
        }
        DocumentGroupDocument mapping = groupDocumentRepository.findByIdAndGroupId(groupDocumentId, groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Group document not found"));
        if (!canManage(principal, group) && !isCurrentUser(principal, mapping.getUploadedByUserId())) {
            throw new ErpExceptions.Forbidden("Document owner or group manager access is required");
        }
        TenderDocument previousDocument = document(mapping.getDocumentId());
        TenderDocument replacement = ingestionService.upload(
                file,
                fallback(previousDocument.getInternalUnit(), DEFAULT_INTERNAL_UNIT),
                fallback(previousDocument.getOrganization(), DEFAULT_ORGANIZATION),
                previousDocument.getYear() == null ? LocalDate.now(ZoneOffset.UTC).getYear() : previousDocument.getYear(),
                mapping.getTenderId(),
                note);
        Instant now = clock.instant();
        long existingVersionCount = groupDocumentVersionRepository.countByGroupDocumentId(mapping.getId());
        if (existingVersionCount == 0) {
            groupDocumentVersionRepository.save(DocumentGroupDocumentVersion.create(
                    mapping.getId(),
                    previousDocument.getId(),
                    1,
                    mapping.getUploadedByUserId(),
                    mapping.getUploadedBy(),
                    mapping.getNote(),
                    mapping.getCreatedAt()));
            existingVersionCount = 1;
        }
        int nextVersion = Math.toIntExact(existingVersionCount + 1);
        mapping.replaceDocument(replacement.getId(), note, mapping.getTenderId(), mapping.getYear());
        groupDocumentVersionRepository.save(DocumentGroupDocumentVersion.create(
                mapping.getId(),
                replacement.getId(),
                nextVersion,
                principal.userId().isPresent() ? principal.userId().getAsLong() : null,
                principal.displayName(),
                note,
                now));
        group.touch(now);
        notifyGroupMembers(
                group,
                principal,
                "document_group_document_replaced",
                "Doküman revizyonu yüklendi",
                group.getName() + " · " + documentName(replacement),
                "document-group-document-replaced:" + group.getId() + ":" + mapping.getId(),
                now);
        return new GroupDocumentItem(mapping, replacement);
    }

    @Transactional(readOnly = true)
    public List<GroupDocumentVersionItem> listDocumentVersions(
            ErpPrincipal principal,
            long groupId,
            long groupDocumentId
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupDocument mapping = groupDocumentRepository.findByIdAndGroupId(groupDocumentId, groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Group document not found"));
        List<DocumentGroupDocumentVersion> versions =
                groupDocumentVersionRepository.findAllByGroupDocumentIdOrderByVersionNumberDescIdDesc(mapping.getId());
        if (versions.isEmpty()) {
            return List.of(new GroupDocumentVersionItem(
                    null,
                    mapping.getId(),
                    document(mapping.getDocumentId()),
                    1,
                    mapping.getUploadedByUserId(),
                    mapping.getUploadedBy(),
                    mapping.getNote(),
                    mapping.getCreatedAt()));
        }
        return versions.stream()
                .map(version -> new GroupDocumentVersionItem(
                        version.getId(),
                        version.getGroupDocumentId(),
                        document(version.getDocumentId()),
                        version.getVersionNumber(),
                        version.getUploadedByUserId(),
                        version.getUploadedBy(),
                        version.getNote(),
                        version.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupDocumentItem> listDocuments(ErpPrincipal principal, long groupId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        return groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(groupId).stream()
                .map(mapping -> new GroupDocumentItem(mapping, document(mapping.getDocumentId())))
                .toList();
    }

    /**
     * Default initial-load page size for a room. The no-argument listing used to return the room's
     * ENTIRE history, so a long-lived room would load thousands of rows into memory and over the
     * wire on every open. Cap it to the most recent page; clients page older messages via before_id.
     */
    private static final int DEFAULT_MESSAGE_PAGE_SIZE = 100;

    @Transactional(readOnly = true)
    public List<DocumentGroupMessage> listMessages(ErpPrincipal principal, long groupId) {
        return listMessages(principal, groupId, DEFAULT_MESSAGE_PAGE_SIZE, null);
    }

    @Transactional(readOnly = true)
    public List<DocumentGroupMessage> listMessages(ErpPrincipal principal, long groupId, int limit, Long beforeId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        List<DocumentGroupMessage> messages = messageRepository.findLatestByGroupId(
                groupId,
                beforeId == null || beforeId <= 0 ? null : beforeId,
                actorKey(principal),
                PageRequest.of(0, Math.max(1, Math.min(limit, 100))));
        return messages.reversed();
    }

    @Transactional
    public DocumentGroupMessage sendMessage(
            ErpPrincipal principal,
            long groupId,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs,
            String clientMessageId,
            Long replyToMessageId
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        if (group.getArchivedAt() != null) {
            throw new ErpExceptions.BadRequest("Document group is archived");
        }
        String kind = normalizeMessageKind(messageKind);
        String cleanedClientMessageId = normalizeClientMessageId(clientMessageId);
        Long authorUserId = principal.userId().isPresent() ? principal.userId().getAsLong() : null;
        if (cleanedClientMessageId != null) {
            List<DocumentGroupMessage> existing = messageRepository.findByClientMessageId(
                    group.getId(),
                    authorUserId,
                    cleanedClientMessageId,
                    PageRequest.of(0, 1));
            if (!existing.isEmpty()) {
                return existing.getFirst();
            }
        }
        Long cleanedReplyToMessageId = replyToMessageId != null && replyToMessageId > 0 ? replyToMessageId : null;
        if (cleanedReplyToMessageId != null) {
            DocumentGroupMessage replyTarget = messageRepository.findById(cleanedReplyToMessageId)
                    .orElseThrow(() -> new ErpExceptions.BadRequest("Replied-to message not found"));
            if (!replyTarget.getGroupId().equals(group.getId())) {
                throw new ErpExceptions.BadRequest("Replied-to message is not part of this room");
            }
        }
        String cleanedBody = "voice".equals(kind) ? "Ses mesajı" : normalizeMessageBody(body);
        String cleanedMediaMimeType = normalizeMessageMediaMimeType(kind, mediaMimeType);
        String cleanedMediaData = normalizeMessageMediaData(group.getId(), kind, mediaMimeType, mediaData);
        Integer cleanedDurationMs = "voice".equals(kind) ? Math.max(0, mediaDurationMs == null ? 0 : mediaDurationMs) : null;

        DocumentGroupMessage message;
        try {
            message = newTransactionExecutor.call(() -> {
                DocumentGroupMessage saved = messageRepository.saveAndFlush(DocumentGroupMessage.create(
                        group.getId(),
                        authorUserId,
                        principal.displayName(),
                        cleanedBody,
                        kind,
                        cleanedMediaMimeType,
                        cleanedMediaData,
                        cleanedDurationMs,
                        cleanedClientMessageId,
                        cleanedReplyToMessageId,
                        clock.instant()));
                saved.assignSequenceNo(saved.getId());
                return messageRepository.saveAndFlush(saved);
            });
        } catch (DataIntegrityViolationException duplicate) {
            // Lost a concurrent race on the client_message_id unique index — return the winner.
            if (cleanedClientMessageId != null) {
                List<DocumentGroupMessage> winner = messageRepository.findByClientMessageId(
                        group.getId(), authorUserId, cleanedClientMessageId, PageRequest.of(0, 1));
                if (!winner.isEmpty()) {
                    return winner.getFirst();
                }
            }
            throw duplicate;
        }
        Instant now = clock.instant();
        group.touch(now);
        notifyGroupMembers(
                group,
                principal,
                "document_group_message",
                "Yeni oda mesajı",
                group.getName() + " · " + messagePreview(message),
                "document-group-message:" + group.getId() + ":" + message.getId(),
                now);
        publishDocumentGroupMessageEvents(group, message.getId());
        return message;
    }

    @Transactional
    public int markMessagesRead(ErpPrincipal principal, long groupId, long throughMessageId) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        String actorKey = actorKey(principal);
        Long currentUserId = principal.userId().isPresent() ? principal.userId().getAsLong() : null;

        // Candidate messages this actor could mark read: everything up to throughMessageId that the
        // actor did not author (you don't "read" your own messages).
        Set<Long> markableIds = new LinkedHashSet<>();
        for (DocumentGroupMessage message : messageRepository.findAllByGroupIdAndIdLessThanEqualOrderByIdAsc(
                group.getId(),
                throughMessageId)) {
            boolean authoredByCurrentActor = principal.admin()
                    ? message.getAuthorUserId() == null
                    : currentUserId != null && currentUserId.equals(message.getAuthorUserId());
            if (!authoredByCurrentActor) {
                markableIds.add(message.getId());
            }
        }
        if (markableIds.isEmpty()) {
            return 0;
        }
        // Two batch lookups + one batch insert, instead of two exists() queries and one save per
        // message — marking a busy room read is O(1) round-trips now, not O(messages).
        Set<Long> alreadyRead = Set.copyOf(messageReadReceiptRepository.findReadMessageIds(actorKey, markableIds));
        Set<Long> hidden = Set.copyOf(messageHiddenReceiptRepository.findHiddenMessageIds(actorKey, markableIds));
        Instant readAt = clock.instant();
        List<DocumentGroupMessageReadReceipt> receipts = markableIds.stream()
                .filter(id -> !alreadyRead.contains(id) && !hidden.contains(id))
                .map(id -> DocumentGroupMessageReadReceipt.create(id, actorKey, readAt))
                .toList();
        messageReadReceiptRepository.saveAll(receipts);
        return receipts.size();
    }

    @Transactional
    public void deleteMessage(ErpPrincipal principal, long groupId, long messageId, String scope) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupMessage message = messageRepository.findById(messageId)
                .filter(value -> value.getGroupId() == groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message not found"));
        if (deleteForMe(scope)) {
            String actorKey = actorKey(principal);
            if (!messageHiddenReceiptRepository.existsByMessageIdAndActorKey(messageId, actorKey)) {
                messageHiddenReceiptRepository.save(DocumentGroupMessageHiddenReceipt.create(
                        messageId,
                        actorKey,
                        clock.instant()));
            }
            return;
        }
        if (!canManage(principal, group) && !isCurrentUser(principal, message.getAuthorUserId())) {
            throw new ErpExceptions.Forbidden("Message owner or group manager access is required");
        }
        String mediaData = message.getMediaData();
        messageRepository.delete(message);
        publishDocumentGroupMessageDeletedEvents(group, messageId);
        // Reclaim the message's uploaded media file after commit (a rollback keeps the row).
        afterCommit(() -> mediaStorage.deleteReference(mediaData));
        group.touch(clock.instant());
    }

    @Transactional(readOnly = true)
    public MessageMediaStorage.StoredContent groupMessageMedia(
            ErpPrincipal principal,
            long groupId,
            long messageId
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        DocumentGroupMessage message = messageRepository.findById(messageId)
                .filter(value -> value.getGroupId() == groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message media not found"));
        if (messageHiddenReceiptRepository.existsByMessageIdAndActorKey(messageId, actorKey(principal))) {
            throw new ErpExceptions.NotFound("Message media not found");
        }
        return mediaStorage.storedContent(message.getMediaData(), message.getMediaMimeType());
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

    @Transactional(readOnly = true)
    public DashboardFileService.StoredFile groupDocumentVersionFile(
            ErpPrincipal principal,
            long groupId,
            long groupDocumentId,
            long versionId
    ) {
        DocumentGroup group = group(groupId);
        requireView(principal, group);
        groupDocumentRepository.findByIdAndGroupId(groupDocumentId, groupId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Group document not found"));
        DocumentGroupDocumentVersion version = groupDocumentVersionRepository.findById(versionId)
                .filter(value -> value.getGroupDocumentId() == groupDocumentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document version not found"));
        return fileService.documentFile(version.getDocumentId());
    }

    private DocumentGroupSummary summary(DocumentGroup group, ErpPrincipal principal) {
        long memberCount = memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).size();
        long documentCount = groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(group.getId()).size();
        long unreadMessageCount = unreadMessageCounts(List.of(group.getId()), principal).getOrDefault(group.getId(), 0L);
        return new DocumentGroupSummary(group, memberCount, documentCount, unreadMessageCount);
    }

    private List<DocumentGroupSummary> summaries(List<DocumentGroup> groups, ErpPrincipal principal) {
        if (groups.isEmpty()) {
            return List.of();
        }
        List<Long> groupIds = groups.stream()
                .map(DocumentGroup::getId)
                .toList();
        Map<Long, Long> memberCounts = groupCountMap(memberRepository.countMembersByGroupIdIn(groupIds));
        Map<Long, Long> documentCounts = groupCountMap(groupDocumentRepository.countDocumentsByGroupIdIn(groupIds));
        Map<Long, Long> unreadMessageCounts = unreadMessageCounts(groupIds, principal);
        return groups.stream()
                .map(group -> new DocumentGroupSummary(
                        group,
                        memberCounts.getOrDefault(group.getId(), 0L),
                        documentCounts.getOrDefault(group.getId(), 0L),
                        unreadMessageCounts.getOrDefault(group.getId(), 0L)))
                .toList();
    }

    private Map<Long, Long> unreadMessageCounts(List<Long> groupIds, ErpPrincipal principal) {
        if (groupIds.isEmpty()) {
            return Map.of();
        }
        Long currentUserId = principal.userId().isPresent() ? principal.userId().getAsLong() : null;
        return groupCountMap(messageRepository.countUnreadByGroupIdIn(
                groupIds,
                actorKey(principal),
                principal.admin(),
                currentUserId));
    }

    private Map<Long, Long> groupCountMap(List<GroupCount> counts) {
        return counts.stream()
                .collect(Collectors.toMap(GroupCount::groupId, GroupCount::total));
    }

    private DocumentGroupDetail detail(DocumentGroup group, ErpPrincipal principal) {
        List<DocumentGroupMemberItem> members = memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).stream()
                .map(member -> new DocumentGroupMemberItem(member, userRepository.findById(member.getUserId()).orElse(null)))
                .toList();
        List<GroupDocumentItem> documents = groupDocumentRepository.findAllByGroupIdOrderByCreatedAtDescIdDesc(group.getId()).stream()
                .map(mapping -> new GroupDocumentItem(mapping, document(mapping.getDocumentId())))
                .toList();
        long unreadMessageCount = unreadMessageCounts(List.of(group.getId()), principal).getOrDefault(group.getId(), 0L);
        return new DocumentGroupDetail(
                new DocumentGroupSummary(group, members.size(), documents.size(), unreadMessageCount),
                members,
                documents);
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

    private void notifyGroupMembers(
            DocumentGroup group,
            ErpPrincipal principal,
            String type,
            String title,
            String body,
            String eventKeyPrefix,
            Instant now
    ) {
        Long actorUserId = principal.userId().isPresent() ? principal.userId().getAsLong() : null;
        List<Long> recipients = memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).stream()
                .map(DocumentGroupMember::getUserId)
                .filter(userId -> actorUserId == null || !userId.equals(actorUserId))
                .distinct()
                .toList();
        notificationService.notifyUsers(recipients, type, title, body, null, "NORMAL", eventKeyPrefix, now);
        if (!principal.admin()) {
            notificationService.notifyAdmin(
                    type,
                    title,
                    body,
                    null,
                    "NORMAL",
                    eventKeyPrefix + ":admin",
                    now);
        }
    }

    private void publishDocumentGroupMessageEvents(DocumentGroup group, long messageId) {
        for (String actorKey : groupActorKeys(group)) {
            afterCommit(() -> chatEventPublisher.publishDocumentGroupMessage(actorKey, group.getId(), messageId));
        }
    }

    private void publishDocumentGroupMessageDeletedEvents(DocumentGroup group, long messageId) {
        for (String actorKey : groupActorKeys(group)) {
            afterCommit(() -> chatEventPublisher.publishDocumentGroupMessageDeleted(actorKey, group.getId(), messageId));
        }
    }

    private Set<String> groupActorKeys(DocumentGroup group) {
        Set<String> actorKeys = new LinkedHashSet<>();
        actorKeys.add("admin");
        memberRepository.findAllByGroupIdOrderByCreatedAtAscIdAsc(group.getId()).stream()
                .map(DocumentGroupMember::getUserId)
                .map(userId -> "user:" + userId)
                .forEach(actorKeys::add);
        return actorKeys;
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }

    private String userName(long userId) {
        return userRepository.findById(userId)
                .map(ErpUser::getName)
                .filter(name -> !name.isBlank())
                .orElse("Kullanıcı " + userId);
    }

    private String documentName(TenderDocument document) {
        if (document.getOriginalFilename() != null && !document.getOriginalFilename().isBlank()) {
            return document.getOriginalFilename();
        }
        if (document.getStoredFilename() != null && !document.getStoredFilename().isBlank()) {
            return document.getStoredFilename();
        }
        return "Doküman #" + document.getId();
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String actorKey(ErpPrincipal principal) {
        if (principal.admin()) {
            return "admin";
        }
        return "user:" + principal.requireUserId();
    }

    private boolean deleteForMe(String scope) {
        if (scope == null || scope.isBlank()) {
            return false;
        }
        String normalized = scope.trim().toLowerCase(Locale.ROOT);
        if (List.of("me", "mine", "self", "benden").contains(normalized)) {
            return true;
        }
        if (List.of("everyone", "all", "herkesten").contains(normalized)) {
            return false;
        }
        throw new ErpExceptions.BadRequest("Unsupported delete scope");
    }

    private String messagePreview(DocumentGroupMessage message) {
        if ("voice".equals(message.getMessageKind())) {
            return message.getAuthorName() + ": Ses mesajı";
        }
        String body = message.getBody();
        if (body.length() <= 80) {
            return message.getAuthorName() + ": " + body;
        }
        return message.getAuthorName() + ": " + body.substring(0, 77) + "...";
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
        if (!List.of("text", "voice", "image", "file").contains(normalized)) {
            throw new ErpExceptions.BadRequest("Unsupported message type");
        }
        return normalized;
    }

    private String normalizeClientMessageId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > 128) {
            throw new ErpExceptions.BadRequest("Client message id is too long");
        }
        return normalized;
    }

    private String normalizeMessageMediaMimeType(String kind, String value) {
        if ("text".equals(kind)) return null;
        if (value == null || value.isBlank()) {
            return "voice".equals(kind) ? "audio/webm" : "application/octet-stream";
        }
        String normalized = value.trim();
        if ("voice".equals(kind) && !normalized.startsWith("audio/")) {
            throw new ErpExceptions.BadRequest("Voice message must be audio");
        }
        if ("image".equals(kind) && !normalized.startsWith("image/")) {
            throw new ErpExceptions.BadRequest("Image message must be an image");
        }
        return normalized;
    }

    private String normalizeMessageMediaData(long groupId, String kind, String mediaMimeType, String value) {
        if ("text".equals(kind)) return null;
        if (value == null || value.isBlank()) {
            throw new ErpExceptions.BadRequest("Message media data is required");
        }
        String normalized = value.trim();
        if (normalized.startsWith("media:")) {
            return mediaStorage.storeDataUrl("document-group-" + groupId, kind, normalized, mediaMimeType);
        }
        if ("voice".equals(kind) && !normalized.startsWith("data:audio/")) {
            throw new ErpExceptions.BadRequest("Voice message data is required");
        }
        if ("image".equals(kind) && !normalized.startsWith("data:image/")) {
            throw new ErpExceptions.BadRequest("Image message data is required");
        }
        if (normalized.length() > 1_500_000) {
            throw new ErpExceptions.BadRequest("Message media is too large");
        }
        return mediaStorage.storeDataUrl("document-group-" + groupId, kind, normalized, mediaMimeType);
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
            long documentCount,
            long unreadMessageCount
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

    public record GroupDocumentVersionItem(
            Long id,
            Long groupDocumentId,
            TenderDocument document,
            Integer versionNumber,
            Long uploadedByUserId,
            String uploadedBy,
            String note,
            Instant createdAt
    ) {
    }

    public record DocumentGroupDetail(
            DocumentGroupSummary summary,
            List<DocumentGroupMemberItem> members,
            List<GroupDocumentItem> documents
    ) {
    }
}
