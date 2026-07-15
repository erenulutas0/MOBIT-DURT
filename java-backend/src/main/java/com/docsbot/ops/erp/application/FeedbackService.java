package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpAnnouncement;
import com.docsbot.ops.erp.domain.ErpFeedback;
import com.docsbot.ops.erp.infrastructure.ErpAnnouncementRepository;
import com.docsbot.ops.erp.infrastructure.ErpFeedbackRepository;

/** Employee feedback + admin announcements backing the mobile help area and the web admin panel. */
@Service
@Profile("postgres")
public class FeedbackService {

    private static final int MAX_MESSAGE_LENGTH = 4000;

    private final ErpFeedbackRepository feedbackRepository;
    private final ErpAnnouncementRepository announcementRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Autowired
    public FeedbackService(
            ErpFeedbackRepository feedbackRepository,
            ErpAnnouncementRepository announcementRepository,
            NotificationService notificationService
    ) {
        this(feedbackRepository, announcementRepository, notificationService, Clock.systemUTC());
    }

    FeedbackService(
            ErpFeedbackRepository feedbackRepository,
            ErpAnnouncementRepository announcementRepository,
            NotificationService notificationService,
            Clock clock
    ) {
        this.feedbackRepository = feedbackRepository;
        this.announcementRepository = announcementRepository;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    @Transactional
    public ErpFeedback submit(ErpPrincipal principal, String category, String message, String appVersion) {
        String cleaned = message == null ? "" : message.trim();
        if (cleaned.isEmpty()) {
            throw new ErpExceptions.BadRequest("Mesaj boş olamaz");
        }
        if (cleaned.length() > MAX_MESSAGE_LENGTH) {
            cleaned = cleaned.substring(0, MAX_MESSAGE_LENGTH);
        }
        Instant now = clock.instant();
        ErpFeedback feedback = feedbackRepository.save(ErpFeedback.create(
                principal.userId().isPresent() ? principal.userId().getAsLong() : null,
                principal.displayName(),
                category,
                cleaned,
                normalizeOptional(appVersion),
                now));
        notificationService.notifyAdmin(
                "feedback_created",
                "Yeni dönüt: " + categoryLabel(feedback.getCategory()),
                feedback.getUserName() + ": " + preview(cleaned),
                null,
                "NORMAL",
                "feedback:" + feedback.getId(),
                now);
        return feedback;
    }

    @Transactional(readOnly = true)
    public List<ErpFeedback> list(ErpPrincipal principal, String status) {
        ErpValidation.requireAdmin(principal);
        String normalized = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty() || "ALL".equals(normalized)) {
            return feedbackRepository.findAllByOrderByCreatedAtDescIdDesc();
        }
        return feedbackRepository.findAllByStatusOrderByCreatedAtDescIdDesc(normalized);
    }

    @Transactional
    public ErpFeedback updateStatus(ErpPrincipal principal, long feedbackId, String status) {
        ErpValidation.requireAdmin(principal);
        ErpFeedback feedback = feedbackRepository.findById(feedbackId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Feedback not found"));
        try {
            feedback.updateStatus(status, principal.displayName(), clock.instant());
        } catch (IllegalArgumentException exception) {
            throw new ErpExceptions.BadRequest("Unknown feedback status");
        }
        return feedback;
    }

    @Transactional(readOnly = true)
    public Optional<ErpAnnouncement> activeAnnouncement() {
        return announcementRepository.findFirstByActiveTrueOrderByUpdatedAtDescIdDesc();
    }

    /** Publishes a new announcement (deactivating the previous), or clears all when title is blank. */
    @Transactional
    public Optional<ErpAnnouncement> publishAnnouncement(ErpPrincipal principal, String title, String body) {
        ErpValidation.requireAdmin(principal);
        Instant now = clock.instant();
        announcementRepository.findAllByActiveTrue().forEach(existing -> existing.deactivate(now));
        String cleanedTitle = title == null ? "" : title.trim();
        String cleanedBody = body == null ? "" : body.trim();
        if (cleanedTitle.isEmpty() && cleanedBody.isEmpty()) {
            return Optional.empty();
        }
        if (cleanedTitle.isEmpty()) {
            cleanedTitle = "Duyuru";
        }
        return Optional.of(announcementRepository.save(
                ErpAnnouncement.publish(cleanedTitle, cleanedBody, principal.displayName(), now)));
    }

    private static String categoryLabel(String category) {
        return switch (category) {
            case "bug" -> "Hata bildirimi";
            case "suggestion" -> "Öneri";
            case "question" -> "Soru";
            default -> "Dönüt";
        };
    }

    private static String preview(String message) {
        return message.length() <= 120 ? message : message.substring(0, 117) + "…";
    }

    private static String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > 64 ? trimmed.substring(0, 64) : trimmed;
    }
}
