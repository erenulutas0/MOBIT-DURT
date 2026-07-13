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

@Component
@Profile("postgres")
public class ChatEventPublisher {

    private static final long STREAM_TIMEOUT_MS = 30L * 60L * 1000L;

    private final Map<String, CopyOnWriteArrayList<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String actorKey) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        subscribers.computeIfAbsent(actorKey, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(actorKey, emitter));
        emitter.onTimeout(() -> remove(actorKey, emitter));
        emitter.onError(ignored -> remove(actorKey, emitter));
        send(actorKey, emitter, "ready", new ChatStreamReadyEvent(actorKey, Instant.now()));
        return emitter;
    }

    public void publishDirectMessage(String actorKey, long messageId) {
        publish(actorKey, "direct_message", new DirectMessageEvent(messageId, Instant.now()));
    }

    public void publishDirectMessageDeleted(String actorKey, long messageId) {
        publish(actorKey, "direct_message_deleted", new DirectMessageEvent(messageId, Instant.now()));
    }

    public void publishDocumentGroupMessage(String actorKey, long groupId, long messageId) {
        publish(actorKey, "document_group_message", new DocumentGroupMessageEvent(groupId, messageId, Instant.now()));
    }

    public void publishDocumentGroupMessageDeleted(String actorKey, long groupId, long messageId) {
        publish(actorKey, "document_group_message_deleted", new DocumentGroupMessageEvent(groupId, messageId, Instant.now()));
    }

    /** Company chat has no per-recipient scoping — every connected stream gets the event. */
    public void publishCompanyChatMessage(long messageId) {
        CompanyChatMessageEvent payload = new CompanyChatMessageEvent(messageId, Instant.now());
        for (String actorKey : subscribers.keySet()) {
            publish(actorKey, "company_chat_message", payload);
        }
    }

    public void publishCompanyChatCleared() {
        Instant now = Instant.now();
        for (String actorKey : subscribers.keySet()) {
            publish(actorKey, "company_chat_cleared", new ChatStreamReadyEvent(actorKey, now));
        }
    }

    int subscriberCount(String actorKey) {
        return subscribers.getOrDefault(actorKey, new CopyOnWriteArrayList<>()).size();
    }

    private void publish(String actorKey, String eventName, Object payload) {
        List<SseEmitter> emitters = subscribers.getOrDefault(actorKey, new CopyOnWriteArrayList<>());
        for (SseEmitter emitter : emitters) {
            send(actorKey, emitter, eventName, payload);
        }
    }

    private void send(String actorKey, SseEmitter emitter, String eventName, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
        } catch (IOException | IllegalStateException exception) {
            remove(actorKey, emitter);
        }
    }

    private void remove(String actorKey, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.get(actorKey);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            subscribers.remove(actorKey, emitters);
        }
    }

    public record ChatStreamReadyEvent(String actorKey, Instant connectedAt) {
    }

    public record DirectMessageEvent(long messageId, Instant createdAt) {
    }

    public record DocumentGroupMessageEvent(long groupId, long messageId, Instant createdAt) {
    }

    public record CompanyChatMessageEvent(long messageId, Instant createdAt) {
    }
}
