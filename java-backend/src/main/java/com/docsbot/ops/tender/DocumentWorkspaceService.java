package com.docsbot.ops.tender;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.tender.domain.DocumentShareLink;
import com.docsbot.ops.tender.domain.DocumentUserState;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.DocumentShareLinkRepository;
import com.docsbot.ops.tender.infrastructure.DocumentUserStateRepository;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class DocumentWorkspaceService {
    private static final int TOKEN_BYTES = 32;
    private static final int MAX_EXPIRY_HOURS = 24 * 30;

    private final TenderDocumentRepository documentRepository;
    private final DocumentUserStateRepository stateRepository;
    private final DocumentShareLinkRepository shareLinkRepository;
    private final DocumentShareAuditService auditService;
    private final SecureRandom secureRandom;
    private final Clock clock;

    @Autowired
    public DocumentWorkspaceService(
            TenderDocumentRepository documentRepository,
            DocumentUserStateRepository stateRepository,
            DocumentShareLinkRepository shareLinkRepository,
            DocumentShareAuditService auditService
    ) {
        this(
                documentRepository,
                stateRepository,
                shareLinkRepository,
                auditService,
                new SecureRandom(),
                Clock.systemUTC());
    }

    DocumentWorkspaceService(
            TenderDocumentRepository documentRepository,
            DocumentUserStateRepository stateRepository,
            DocumentShareLinkRepository shareLinkRepository,
            DocumentShareAuditService auditService,
            SecureRandom secureRandom,
            Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.stateRepository = stateRepository;
        this.shareLinkRepository = shareLinkRepository;
        this.auditService = auditService;
        this.secureRandom = secureRandom;
        this.clock = clock;
    }

    @Transactional
    public DocumentWorkspaceItem setFavorite(ErpPrincipal principal, long documentId, boolean favorite) {
        TenderDocument document = requireDocument(documentId);
        Instant now = clock.instant();
        DocumentUserState state = state(principal, documentId, now);
        state.setFavorite(favorite, now);
        audit(principal.displayName(), favorite ? "document_favorited" : "document_unfavorited", documentId, now);
        return new DocumentWorkspaceItem(document, state);
    }

    @Transactional(readOnly = true)
    public List<DocumentWorkspaceItem> favorites(ErpPrincipal principal) {
        return items(stateRepository.findByOwnerKeyAndFavoriteTrueOrderByFavoritedAtDescIdDesc(ownerKey(principal)));
    }

    @Transactional(readOnly = true)
    public List<DocumentWorkspaceItem> recent(ErpPrincipal principal, int limit) {
        int normalizedLimit = Math.max(1, Math.min(limit, 100));
        return items(stateRepository
                .findByOwnerKeyAndLastAccessedAtIsNotNullOrderByLastAccessedAtDescIdDesc(
                        ownerKey(principal),
                        PageRequest.of(0, normalizedLimit)));
    }

    @Transactional
    public void recordAccess(ErpPrincipal principal, long documentId) {
        requireDocument(documentId);
        Instant now = clock.instant();
        state(principal, documentId, now).recordAccess(now);
    }

    @Transactional
    public CreatedShareLink createShareLink(ErpPrincipal principal, long documentId, int expiresInHours) {
        requireDocument(documentId);
        int normalizedHours = Math.max(1, Math.min(expiresInHours, MAX_EXPIRY_HOURS));
        Instant now = clock.instant();
        String token = token();
        DocumentShareLink link = shareLinkRepository.save(DocumentShareLink.create(
                documentId,
                hash(token),
                actor(principal),
                now.plus(Duration.ofHours(normalizedHours)),
                now));
        audit(principal.displayName(), "document_share_created", documentId, now);
        return new CreatedShareLink(link, token);
    }

    @Transactional(readOnly = true)
    public List<DocumentShareLink> shareLinks(ErpPrincipal principal, long documentId) {
        requireDocument(documentId);
        return shareLinkRepository.findAllByDocumentIdOrderByCreatedAtDescIdDesc(documentId);
    }

    @Transactional
    public DocumentShareLink revokeShareLink(ErpPrincipal principal, long shareLinkId) {
        DocumentShareLink link = shareLinkRepository.findById(shareLinkId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Share link not found"));
        Instant now = clock.instant();
        link.revoke(now);
        audit(principal.displayName(), "document_share_revoked", link.getDocumentId(), now);
        return link;
    }

    @Transactional
    public long resolveSharedDocument(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ErpExceptions.NotFound("Share link not found");
        }
        DocumentShareLink link = shareLinkRepository.findByTokenHash(hash(rawToken.trim()))
                .orElseThrow(() -> new ErpExceptions.NotFound("Share link not found"));
        Instant now = clock.instant();
        if (!link.activeAt(now)) {
            audit("public-share", "document_share_rejected", link.getDocumentId(), now);
            throw new ErpExceptions.NotFound("Share link not found");
        }
        requireDocument(link.getDocumentId());
        link.recordAccess(now);
        audit("public-share", "document_share_accessed", link.getDocumentId(), now);
        return link.getDocumentId();
    }

    private List<DocumentWorkspaceItem> items(List<DocumentUserState> states) {
        if (states.isEmpty()) {
            return List.of();
        }
        Map<Long, TenderDocument> documents = new LinkedHashMap<>();
        documentRepository.findAllById(states.stream().map(DocumentUserState::getDocumentId).toList())
                .forEach(document -> documents.put(document.getId(), document));
        return states.stream()
                .filter(state -> documents.containsKey(state.getDocumentId()))
                .map(state -> new DocumentWorkspaceItem(documents.get(state.getDocumentId()), state))
                .toList();
    }

    private DocumentUserState state(ErpPrincipal principal, long documentId, Instant now) {
        String ownerKey = ownerKey(principal);
        return stateRepository.findByOwnerKeyAndDocumentId(ownerKey, documentId)
                .orElseGet(() -> stateRepository.save(DocumentUserState.create(ownerKey, documentId, now)));
    }

    private TenderDocument requireDocument(long documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    private String ownerKey(ErpPrincipal principal) {
        return truncate("subject:" + actor(principal), 255);
    }

    private String actor(ErpPrincipal principal) {
        String subject = principal.subject();
        if (subject != null && !subject.isBlank()) {
            return subject.trim();
        }
        return principal.displayName() == null || principal.displayName().isBlank()
                ? "unknown"
                : principal.displayName().trim();
    }

    private String token() {
        byte[] value = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Share token could not be hashed", exception);
        }
    }

    private void audit(String actor, String eventType, long documentId, Instant now) {
        auditService.record(actor, eventType, documentId, now);
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public record DocumentWorkspaceItem(TenderDocument document, DocumentUserState state) {
    }

    public record CreatedShareLink(DocumentShareLink link, String token) {
    }
}
