package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;

@Service
@Profile("postgres")
class ErpDirectMessageService {
    private final ErpDirectMessageRepository messageRepository;
    private final ErpUserRepository userRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final Clock clock;

    @Autowired
    ErpDirectMessageService(
            ErpDirectMessageRepository messageRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder
    ) {
        this(messageRepository, userRepository, notificationService, activityRecorder, Clock.systemUTC());
    }

    ErpDirectMessageService(
            ErpDirectMessageRepository messageRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            Clock clock
    ) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<ErpDirectMessage> listMessages(ErpPrincipal principal, int limit) {
        Long userId = principal.admin() ? null : principal.requireUserId();
        return messageRepository.findVisible(
                principal.admin(),
                userId,
                PageRequest.of(0, Math.max(1, Math.min(limit, 100))));
    }

    @Transactional
    ErpDirectMessage sendMessage(
            ErpPrincipal principal,
            Long recipientUserId,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs
    ) {
        String cleanedKind = normalizeKind(messageKind);
        String cleanedBody = switch (cleanedKind) {
            case "voice" -> fallback(body, "Ses mesajı");
            case "image" -> fallback(body, "Görsel");
            case "file" -> fallback(body, "Dosya");
            default -> ErpValidation.normalizeRequiredMessage(body);
        };
        String cleanedMediaMimeType = normalizeOptional(mediaMimeType, 128);
        String cleanedMediaData = normalizeMediaData(cleanedKind, mediaData);
        Integer cleanedDurationMs = normalizeDuration(cleanedKind, mediaDurationMs);
        Actor sender = sender(principal);
        Actor recipient = recipient(sender, recipientUserId);
        Instant now = clock.instant();

        ErpDirectMessage message = messageRepository.saveAndFlush(ErpDirectMessage.create(
                sender.type(),
                sender.userId(),
                sender.name(),
                recipient.type(),
                recipient.userId(),
                recipient.name(),
                cleanedBody,
                cleanedKind,
                cleanedMediaMimeType,
                cleanedMediaData,
                cleanedDurationMs,
                now));
        notifyRecipient(message, now);
        activityRecorder.record(
                principal,
                "DIRECT_MESSAGE_SENT",
                "DIRECT_MESSAGE",
                message.getId().toString(),
                null,
                "recipient_type=" + recipient.type()
                        + (recipient.userId() == null ? "" : "; recipient_user_id=" + recipient.userId()));
        return message;
    }

    @Transactional
    ErpDirectMessage markRead(ErpPrincipal principal, long messageId) {
        ErpDirectMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message not found"));
        long userId = principal.admin() ? 0 : principal.requireUserId();
        if (!message.recipientMatches(principal.admin(), userId)) {
            throw new ErpExceptions.NotFound("Message not found");
        }
        message.markRead(clock.instant());
        activityRecorder.record(
                principal,
                "DIRECT_MESSAGE_READ",
                "DIRECT_MESSAGE",
                message.getId().toString(),
                null,
                null);
        return message;
    }

    private Actor sender(ErpPrincipal principal) {
        if (principal.admin()) {
            return new Actor(ErpDirectMessage.ACTOR_ADMIN, null, fallback(principal.displayName(), "Admin"));
        }
        long userId = principal.requireUserId();
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.Forbidden("Authenticated employee identity is required"));
        if (user.getApprovedAt() == null) {
            throw new ErpExceptions.Forbidden("Approved employee identity is required");
        }
        return new Actor(ErpDirectMessage.ACTOR_USER, user.getId(), fallback(user.getName(), principal.displayName()));
    }

    private Actor recipient(Actor sender, Long recipientUserId) {
        if (recipientUserId == null || recipientUserId == 0) {
            if (ErpDirectMessage.ACTOR_ADMIN.equals(sender.type())) {
                throw new ErpExceptions.BadRequest("Recipient user is required");
            }
            return new Actor(ErpDirectMessage.ACTOR_ADMIN, null, "Admin");
        }
        ErpUser user = userRepository.findById(recipientUserId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Recipient user not found"));
        if (user.getApprovedAt() == null) {
            throw new ErpExceptions.NotFound("Recipient user not found");
        }
        if (ErpDirectMessage.ACTOR_USER.equals(sender.type()) && recipientUserId.equals(sender.userId())) {
            throw new ErpExceptions.BadRequest("Recipient must be different from sender");
        }
        return new Actor(ErpDirectMessage.ACTOR_USER, user.getId(), fallback(user.getName(), "User " + user.getId()));
    }

    private void notifyRecipient(ErpDirectMessage message, Instant now) {
        String title = "New direct message";
        String body = "voice".equals(message.getMessageKind())
                ? message.getSenderName() + " · Ses mesajı"
                : message.getSenderName();
        if (ErpDirectMessage.ACTOR_ADMIN.equals(message.getRecipientType())) {
            notificationService.notifyAdmin(
                    "direct_message",
                    title,
                    body,
                    null,
                    "NORMAL",
                    "direct-message:" + message.getId(),
                    now);
            return;
        }
        notificationService.notifyUsers(
                List.of(message.getRecipientUserId()),
                "direct_message",
                title,
                body,
                null,
                "NORMAL",
                "direct-message:" + message.getId(),
                now);
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String normalizeKind(String value) {
        if (value == null || value.isBlank()) {
            return "text";
        }
        String normalized = value.trim().toLowerCase();
        if (!List.of("text", "voice", "image", "file").contains(normalized)) {
            throw new ErpExceptions.BadRequest("Unsupported message kind");
        }
        return normalized;
    }

    private String normalizeOptional(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new ErpExceptions.BadRequest("Message media metadata is too long");
        }
        return normalized;
    }

    private String normalizeMediaData(String kind, String value) {
        if ("text".equals(kind)) {
            return null;
        }
        if (value == null || value.isBlank()) {
            throw new ErpExceptions.BadRequest("Message media data is required");
        }
        String normalized = value.trim();
        if ("voice".equals(kind) && !normalized.startsWith("data:audio/")) {
            throw new ErpExceptions.BadRequest("Voice message must be audio data");
        }
        if ("image".equals(kind) && !normalized.startsWith("data:image/")) {
            throw new ErpExceptions.BadRequest("Image message must be image data");
        }
        if (!"voice".equals(kind) && !normalized.startsWith("data:")) {
            throw new ErpExceptions.BadRequest("File message must be data URL");
        }
        if (normalized.length() > 8_000_000) {
            throw new ErpExceptions.BadRequest("Message media is too large");
        }
        return normalized;
    }

    private Integer normalizeDuration(String kind, Integer value) {
        if (!"voice".equals(kind)) {
            return null;
        }
        if (value == null || value < 0) {
            return 0;
        }
        return Math.min(value, 10 * 60 * 1000);
    }

    private record Actor(String type, Long userId, String name) {
    }
}
