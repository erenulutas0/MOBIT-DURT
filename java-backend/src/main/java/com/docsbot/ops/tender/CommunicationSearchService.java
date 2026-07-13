package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;
import com.docsbot.ops.tender.domain.DocumentGroup;
import com.docsbot.ops.tender.domain.DocumentGroupDocument;
import com.docsbot.ops.tender.domain.DocumentGroupMessage;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.DocumentGroupDocumentRepository;
import com.docsbot.ops.tender.infrastructure.DocumentGroupMessageRepository;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

/**
 * Searches across the two chat surfaces (direct messages, document-room messages) and
 * room document filenames in one call, scoped to what the caller can already see.
 * Tender Hub's own document/full-text search (filenames + extracted text, admin-only)
 * is a separate, already-existing endpoint and out of scope here.
 */
@Service
@Profile("postgres")
public class CommunicationSearchService {

    private static final int RESULTS_PER_TYPE = 20;

    private final ErpDirectMessageRepository directMessageRepository;
    private final DocumentGroupMessageRepository roomMessageRepository;
    private final DocumentGroupDocumentRepository roomDocumentRepository;
    private final TenderDocumentRepository tenderDocumentRepository;
    private final DocumentGroupService documentGroupService;

    public CommunicationSearchService(
            ErpDirectMessageRepository directMessageRepository,
            DocumentGroupMessageRepository roomMessageRepository,
            DocumentGroupDocumentRepository roomDocumentRepository,
            TenderDocumentRepository tenderDocumentRepository,
            DocumentGroupService documentGroupService
    ) {
        this.directMessageRepository = directMessageRepository;
        this.roomMessageRepository = roomMessageRepository;
        this.roomDocumentRepository = roomDocumentRepository;
        this.tenderDocumentRepository = tenderDocumentRepository;
        this.documentGroupService = documentGroupService;
    }

    public record SearchResult(
            String type,
            long id,
            Long groupId,
            String groupName,
            Long otherUserId,
            String title,
            String snippet,
            Instant createdAt
    ) {
    }

    @Transactional(readOnly = true)
    public List<SearchResult> search(ErpPrincipal principal, String query) {
        String term = query == null ? "" : query.trim();
        if (term.length() < 2) {
            return List.of();
        }
        List<SearchResult> results = new java.util.ArrayList<>();
        results.addAll(searchDirectMessages(principal, term));

        Map<Long, String> visibleGroupNames = visibleGroupNames(principal);
        if (!visibleGroupNames.isEmpty()) {
            results.addAll(searchRoomMessages(principal, term, visibleGroupNames));
            results.addAll(searchRoomDocuments(term, visibleGroupNames));
        }
        return results;
    }

    private List<SearchResult> searchDirectMessages(ErpPrincipal principal, String term) {
        Long userId = principal.admin() ? null : principal.requireUserId();
        String actorKey = principal.admin() ? "admin" : "user:" + principal.requireUserId();
        List<ErpDirectMessage> matches = directMessageRepository.searchVisible(
                principal.admin(), userId, actorKey, term, PageRequest.of(0, RESULTS_PER_TYPE));
        return matches.stream()
                .map(message -> new SearchResult(
                        "direct_message",
                        message.getId(),
                        null,
                        null,
                        message.getSenderType().equals("user") ? message.getSenderUserId() : message.getRecipientUserId(),
                        message.getSenderType().equals("admin") ? message.getRecipientName() : message.getSenderName(),
                        snippet(message.getBody(), term),
                        message.getCreatedAt()))
                .toList();
    }

    private Map<Long, String> visibleGroupNames(ErpPrincipal principal) {
        Map<Long, String> names = new LinkedHashMap<>();
        for (DocumentGroupService.DocumentGroupSummary summary : documentGroupService.listGroups(principal)) {
            DocumentGroup group = summary.group();
            names.put(group.getId(), group.getName());
        }
        return names;
    }

    private List<SearchResult> searchRoomMessages(ErpPrincipal principal, String term, Map<Long, String> groupNames) {
        String actorKey = principal.admin() ? "admin" : "user:" + principal.requireUserId();
        List<DocumentGroupMessage> matches = roomMessageRepository.searchVisible(
                groupNames.keySet(), actorKey, term, PageRequest.of(0, RESULTS_PER_TYPE));
        return matches.stream()
                .map(message -> new SearchResult(
                        "room_message",
                        message.getId(),
                        message.getGroupId(),
                        groupNames.get(message.getGroupId()),
                        null,
                        message.getAuthorName(),
                        snippet(message.getBody(), term),
                        message.getCreatedAt()))
                .toList();
    }

    private List<SearchResult> searchRoomDocuments(String term, Map<Long, String> groupNames) {
        List<DocumentGroupDocument> candidates = roomDocumentRepository
                .findAllByGroupIdInOrderByCreatedAtDescIdDesc(groupNames.keySet());
        if (candidates.isEmpty()) {
            return List.of();
        }
        Map<Long, TenderDocument> documentsById = tenderDocumentRepository
                .findAllById(candidates.stream().map(DocumentGroupDocument::getDocumentId).distinct().toList())
                .stream()
                .collect(java.util.stream.Collectors.toMap(TenderDocument::getId, doc -> doc));
        String lowerTerm = term.toLowerCase(Locale.ROOT);
        return candidates.stream()
                .map(groupDocument -> {
                    TenderDocument document = documentsById.get(groupDocument.getDocumentId());
                    String filename = document == null ? null : document.getOriginalFilename();
                    return filename == null ? null : Map.entry(groupDocument, filename);
                })
                .filter(java.util.Objects::nonNull)
                .filter(entry -> entry.getValue().toLowerCase(Locale.ROOT).contains(lowerTerm))
                .limit(RESULTS_PER_TYPE)
                .map(entry -> new SearchResult(
                        "room_document",
                        entry.getKey().getId(),
                        entry.getKey().getGroupId(),
                        groupNames.get(entry.getKey().getGroupId()),
                        null,
                        entry.getValue(),
                        null,
                        entry.getKey().getCreatedAt()))
                .toList();
    }

    private static String snippet(String body, String term) {
        if (body == null) return "";
        int index = body.toLowerCase(Locale.ROOT).indexOf(term.toLowerCase(Locale.ROOT));
        if (index < 0) return body.length() > 140 ? body.substring(0, 140) + "…" : body;
        int start = Math.max(0, index - 40);
        int end = Math.min(body.length(), index + term.length() + 60);
        String prefix = start > 0 ? "…" : "";
        String suffix = end < body.length() ? "…" : "";
        return prefix + body.substring(start, end) + suffix;
    }
}
