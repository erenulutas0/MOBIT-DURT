package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import org.springframework.dao.DataIntegrityViolationException;

import com.docsbot.ops.common.media.MessageMediaStorage;
import com.docsbot.ops.common.tx.NewTransactionExecutor;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.domain.ErpDirectMessageHiddenReceipt;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageHiddenReceiptRepository;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;

@Service
@Profile("postgres")
class ErpDirectMessageService {
    private final ErpDirectMessageRepository messageRepository;
    private final ErpDirectMessageHiddenReceiptRepository hiddenReceiptRepository;
    private final ErpUserRepository userRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final MessageMediaStorage mediaStorage;
    private final ChatEventPublisher chatEventPublisher;
    private final NewTransactionExecutor newTransactionExecutor;
    private final Clock clock;

    @Autowired
    ErpDirectMessageService(
            ErpDirectMessageRepository messageRepository,
            ErpDirectMessageHiddenReceiptRepository hiddenReceiptRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            MessageMediaStorage mediaStorage,
            ChatEventPublisher chatEventPublisher,
            NewTransactionExecutor newTransactionExecutor
    ) {
        this(
                messageRepository,
                hiddenReceiptRepository,
                userRepository,
                notificationService,
                activityRecorder,
                mediaStorage,
                chatEventPublisher,
                newTransactionExecutor,
                Clock.systemUTC());
    }

    ErpDirectMessageService(
            ErpDirectMessageRepository messageRepository,
            ErpDirectMessageHiddenReceiptRepository hiddenReceiptRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            MessageMediaStorage mediaStorage,
            ChatEventPublisher chatEventPublisher,
            NewTransactionExecutor newTransactionExecutor,
            Clock clock
    ) {
        this.messageRepository = messageRepository;
        this.hiddenReceiptRepository = hiddenReceiptRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.mediaStorage = mediaStorage;
        this.chatEventPublisher = chatEventPublisher;
        this.newTransactionExecutor = newTransactionExecutor;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<ErpDirectMessage> listMessages(ErpPrincipal principal, int limit) {
        return listMessages(principal, limit, null);
    }

    @Transactional(readOnly = true)
    List<ErpDirectMessage> listMessages(ErpPrincipal principal, int limit, Long beforeId) {
        Long userId = principal.admin() ? null : principal.requireUserId();
        PageRequest pageable = PageRequest.of(0, Math.max(1, Math.min(limit, 100)));
        String actorKey = actorKey(principal);
        if (beforeId != null && beforeId > 0) {
            return messageRepository.findVisibleBefore(principal.admin(), userId, beforeId, actorKey, pageable);
        }
        return messageRepository.findVisible(principal.admin(), userId, actorKey, pageable);
    }

    @Transactional(readOnly = true)
    SseEmitter stream(ErpPrincipal principal) {
        return chatEventPublisher.subscribe(actorKey(principal));
    }

    @Transactional
    ErpDirectMessage sendMessage(
            ErpPrincipal principal,
            Long recipientUserId,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs,
            String clientMessageId,
            Long replyToMessageId
    ) {
        String cleanedKind = normalizeKind(messageKind);
        String cleanedBody = switch (cleanedKind) {
            case "voice" -> fallback(body, "Ses mesajı");
            case "image" -> fallback(body, "Görsel");
            case "file" -> fallback(body, "Dosya");
            default -> ErpValidation.normalizeRequiredMessage(body);
        };
        String cleanedClientMessageId = normalizeClientMessageId(clientMessageId);
        Actor sender = sender(principal);
        Actor recipient = recipient(sender, recipientUserId);
        if (cleanedClientMessageId != null) {
            List<ErpDirectMessage> existing = messageRepository.findByClientMessageId(
                    sender.type(),
                    sender.userId(),
                    cleanedClientMessageId,
                    PageRequest.of(0, 1));
            if (!existing.isEmpty()) {
                return existing.getFirst();
            }
        }
        Long cleanedReplyToMessageId = replyToMessageId != null && replyToMessageId > 0 ? replyToMessageId : null;
        if (cleanedReplyToMessageId != null) {
            ErpDirectMessage replyTarget = messageRepository.findById(cleanedReplyToMessageId)
                    .orElseThrow(() -> new ErpExceptions.BadRequest("Replied-to message not found"));
            requireSameThread(replyTarget, sender, recipient);
        }
        String cleanedMediaMimeType = normalizeOptional(mediaMimeType, 128);
        String cleanedMediaData = normalizeMediaData(cleanedKind, cleanedMediaMimeType, mediaData);
        Integer cleanedDurationMs = normalizeDuration(cleanedKind, mediaDurationMs);
        Instant now = clock.instant();

        ErpDirectMessage message;
        try {
            message = newTransactionExecutor.call(() -> messageRepository.saveAndFlush(ErpDirectMessage.create(
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
                    cleanedClientMessageId,
                    cleanedReplyToMessageId,
                    now)));
        } catch (DataIntegrityViolationException duplicate) {
            // Lost a concurrent race on the client_message_id unique index — the winning
            // insert committed in its own transaction; return that row so the retry is idempotent.
            if (cleanedClientMessageId != null) {
                List<ErpDirectMessage> winner = messageRepository.findByClientMessageId(
                        sender.type(), sender.userId(), cleanedClientMessageId, PageRequest.of(0, 1));
                if (!winner.isEmpty()) {
                    return winner.getFirst();
                }
            }
            throw duplicate;
        }
        notifyRecipient(message, now);
        publishDirectMessageEvents(message);
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

    @Transactional(readOnly = true)
    MessageMediaStorage.StoredContent readMessageMedia(ErpPrincipal principal, long messageId) {
        ErpDirectMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message media not found"));
        long userId = principal.admin() ? 0 : principal.requireUserId();
        String actorKey = actorKey(principal);
        if (!message.visibleTo(principal.admin(), userId)
                || hiddenReceiptRepository.existsByMessageIdAndActorKey(messageId, actorKey)) {
            throw new ErpExceptions.NotFound("Message media not found");
        }
        return mediaStorage.storedContent(message.getMediaData(), message.getMediaMimeType());
    }

    @Transactional
    void deleteMessage(ErpPrincipal principal, long messageId, String scope) {
        ErpDirectMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Message not found"));
        long userId = principal.admin() ? 0 : principal.requireUserId();
        if (!message.visibleTo(principal.admin(), userId)) {
            throw new ErpExceptions.NotFound("Message not found");
        }
        if (deleteForMe(scope)) {
            String actorKey = actorKey(principal);
            if (!hiddenReceiptRepository.existsByMessageIdAndActorKey(messageId, actorKey)) {
                hiddenReceiptRepository.save(ErpDirectMessageHiddenReceipt.create(
                        messageId,
                        actorKey,
                        clock.instant()));
            }
            activityRecorder.record(
                    principal,
                    "DIRECT_MESSAGE_HIDDEN",
                    "DIRECT_MESSAGE",
                    Long.toString(messageId),
                    null,
                    null);
            return;
        }
        String mediaData = message.getMediaData();
        messageRepository.delete(message);
        publishDirectMessageDeletedEvents(message);
        // Reclaim the message's uploaded media file after commit (a rollback would keep the row).
        afterCommit(() -> mediaStorage.deleteReference(mediaData));
        activityRecorder.record(
                principal,
                "DIRECT_MESSAGE_DELETED",
                "DIRECT_MESSAGE",
                Long.toString(messageId),
                null,
                null);
    }

    private String actorKey(ErpPrincipal principal) {
        if (principal.admin()) {
            return "admin";
        }
        return "user:" + principal.requireUserId();
    }

    private String actorKey(String actorType, Long userId) {
        if (ErpDirectMessage.ACTOR_ADMIN.equals(actorType)) {
            return "admin";
        }
        return userId == null ? null : "user:" + userId;
    }

    private void publishDirectMessageEvents(ErpDirectMessage message) {
        for (String actorKey : directMessageActorKeys(message)) {
            afterCommit(() -> chatEventPublisher.publishDirectMessage(actorKey, message.getId()));
        }
    }

    private void publishDirectMessageDeletedEvents(ErpDirectMessage message) {
        for (String actorKey : directMessageActorKeys(message)) {
            afterCommit(() -> chatEventPublisher.publishDirectMessageDeleted(actorKey, message.getId()));
        }
    }

    private Set<String> directMessageActorKeys(ErpDirectMessage message) {
        Set<String> actorKeys = new LinkedHashSet<>();
        String senderKey = actorKey(message.getSenderType(), message.getSenderUserId());
        String recipientKey = actorKey(message.getRecipientType(), message.getRecipientUserId());
        if (senderKey != null) actorKeys.add(senderKey);
        if (recipientKey != null) actorKeys.add(recipientKey);
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

    private void requireSameThread(ErpDirectMessage target, Actor sender, Actor recipient) {
        boolean direct = sameActor(target.getSenderType(), target.getSenderUserId(), sender)
                && sameActor(target.getRecipientType(), target.getRecipientUserId(), recipient);
        boolean reverse = sameActor(target.getSenderType(), target.getSenderUserId(), recipient)
                && sameActor(target.getRecipientType(), target.getRecipientUserId(), sender);
        if (!direct && !reverse) {
            throw new ErpExceptions.BadRequest("Replied-to message is not part of this conversation");
        }
    }

    private boolean sameActor(String type, Long userId, Actor actor) {
        return type.equals(actor.type()) && java.util.Objects.equals(userId, actor.userId());
    }

    private void notifyRecipient(ErpDirectMessage message, Instant now) {
        // WhatsApp-style: the sender is the title so the recipient sees who wrote at a glance,
        // and the body carries a content preview (or a media label).
        String title = message.getSenderName();
        String body = directMessagePreview(message);
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

    private String directMessagePreview(ErpDirectMessage message) {
        String kind = message.getMessageKind();
        if ("voice".equals(kind)) {
            return "🎤 Ses mesajı";
        }
        if ("image".equals(kind)) {
            return "📷 Fotoğraf";
        }
        if ("file".equals(kind)) {
            return "📎 Doküman gönderdi";
        }
        String text = message.getBody() == null ? "" : message.getBody().strip();
        if (text.isEmpty()) {
            return "Yeni mesaj";
        }
        return text.length() <= 120 ? text : text.substring(0, 117) + "…";
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

    private String normalizeMediaData(String kind, String mediaMimeType, String value) {
        if ("text".equals(kind)) {
            return null;
        }
        if (value == null || value.isBlank()) {
            throw new ErpExceptions.BadRequest("Message media data is required");
        }
        String normalized = value.trim();
        if (normalized.startsWith("media:")) {
            return mediaStorage.storeDataUrl("direct", kind, normalized, mediaMimeType);
        }
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
        return mediaStorage.storeDataUrl("direct", kind, normalized, mediaMimeType);
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
