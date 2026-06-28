package com.docsbot.ops.erp.application;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.docsbot.ops.erp.domain.ErpNotification;

@Component
@Profile("postgres")
public class NotificationEventPublisher {

    private static final long STREAM_TIMEOUT_MS = 30L * 60L * 1000L;

    private final Map<Long, CopyOnWriteArrayList<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    public SseEmitter subscribe(long recipientId) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        subscribers.computeIfAbsent(recipientId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(recipientId, emitter));
        emitter.onTimeout(() -> remove(recipientId, emitter));
        emitter.onError(ignored -> remove(recipientId, emitter));
        send(recipientId, emitter, "ready", new StreamReadyEvent(recipientId, Instant.now()));
        return emitter;
    }

    public void publishNotification(ErpNotification notification, long unreadCount) {
        publish(
                notification.getUserId(),
                "notification",
                NotificationStreamEvent.from(notification, unreadCount));
    }

    public void publishUnreadCount(long recipientId, long unreadCount) {
        publish(recipientId, "unread_count", new UnreadCountStreamEvent(recipientId, unreadCount));
    }

    int subscriberCount(long recipientId) {
        return subscribers.getOrDefault(recipientId, new CopyOnWriteArrayList<>()).size();
    }

    private void publish(long recipientId, String eventName, Object payload) {
        List<SseEmitter> emitters = subscribers.getOrDefault(recipientId, new CopyOnWriteArrayList<>());
        for (SseEmitter emitter : emitters) {
            send(recipientId, emitter, eventName, payload);
        }
    }

    private void send(long recipientId, SseEmitter emitter, String eventName, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
        } catch (IOException | IllegalStateException exception) {
            remove(recipientId, emitter);
        }
    }

    private void remove(long recipientId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.get(recipientId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            subscribers.remove(recipientId, emitters);
        }
    }

    public record StreamReadyEvent(long recipientId, Instant connectedAt) {
    }

    public record UnreadCountStreamEvent(long recipientId, long unreadCount) {
    }

    public record NotificationStreamEvent(
            Long id,
            Long userId,
            String type,
            String title,
            String body,
            Long taskId,
            String priority,
            String eventKey,
            Instant readAt,
            Instant createdAt,
            long unreadCount
    ) {
        static NotificationStreamEvent from(ErpNotification notification, long unreadCount) {
            return new NotificationStreamEvent(
                    notification.getId(),
                    notification.getUserId(),
                    notification.getType(),
                    notification.getTitle(),
                    notification.getBody(),
                    notification.getTaskId(),
                    notification.getPriority(),
                    notification.getEventKey(),
                    notification.getReadAt(),
                    notification.getCreatedAt(),
                    unreadCount);
        }
    }
}
