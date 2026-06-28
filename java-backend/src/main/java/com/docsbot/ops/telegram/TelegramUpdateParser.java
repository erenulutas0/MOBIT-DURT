package com.docsbot.ops.telegram;

import java.time.Instant;
import java.util.Comparator;
import java.util.Optional;

import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

@Component
public class TelegramUpdateParser {

    public Optional<MediaMessage> media(JsonNode update) {
        JsonNode message = message(update);
        if (message.isMissingNode()) return Optional.empty();
        String chatId = text(message.path("chat").path("id"));
        String messageId = text(message.path("message_id"));
        String senderId = text(message.path("from").path("id"));
        if (senderId.isBlank()) senderId = chatId;
        if (chatId.isBlank() || messageId.isBlank() || senderId.isBlank()) {
            return Optional.empty();
        }
        Instant timestamp = Instant.ofEpochSecond(
                message.path("date").asLong(Instant.now().getEpochSecond()));
        String caption = nullableText(message.path("caption"));

        JsonNode document = message.path("document");
        if (!document.isMissingNode()) {
            return mediaMessage(
                    chatId, messageId, senderId, timestamp, caption,
                    document, nullableText(document.path("file_name")),
                    nullableText(document.path("mime_type")));
        }

        JsonNode photos = message.path("photo");
        if (photos.isArray() && !photos.isEmpty()) {
            JsonNode largest = java.util.stream.StreamSupport.stream(
                            photos.spliterator(), false)
                    .max(Comparator.comparingLong(value -> value.path("file_size").asLong(0)))
                    .orElse(null);
            if (largest != null) {
                return mediaMessage(
                        chatId, messageId, senderId, timestamp, caption,
                        largest, null, "image/jpeg");
            }
        }
        return Optional.empty();
    }

    public Optional<TextMessage> textMessage(JsonNode update) {
        JsonNode message = message(update);
        if (message.isMissingNode()) return Optional.empty();
        String text = nullableText(message.path("text"));
        String chatId = text(message.path("chat").path("id"));
        String senderId = text(message.path("from").path("id"));
        if (senderId.isBlank()) senderId = chatId;
        if (text == null || chatId.isBlank()) return Optional.empty();
        return Optional.of(new TextMessage(
                chatId,
                nullableText(message.path("chat").path("title")),
                senderId,
                text));
    }

    public Optional<Callback> callback(JsonNode update) {
        JsonNode callback = update.path("callback_query");
        if (callback.isMissingNode()) return Optional.empty();
        String callbackId = text(callback.path("id"));
        String data = text(callback.path("data"));
        String senderId = text(callback.path("from").path("id"));
        JsonNode message = callback.path("message");
        String chatId = text(message.path("chat").path("id"));
        if (senderId.isBlank()) senderId = chatId;
        if (callbackId.isBlank() || data.isBlank()
                || chatId.isBlank() || senderId.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new Callback(
                callbackId,
                chatId,
                nullableText(message.path("chat").path("title")),
                senderId,
                data));
    }

    public Optional<Membership> membership(JsonNode update) {
        JsonNode membership = update.path("my_chat_member");
        if (membership.isMissingNode()) return Optional.empty();
        String chatId = text(membership.path("chat").path("id"));
        String oldStatus = text(membership.path("old_chat_member").path("status"));
        String newStatus = text(membership.path("new_chat_member").path("status"));
        if (chatId.isBlank()) return Optional.empty();
        return Optional.of(new Membership(
                chatId,
                oldStatus,
                newStatus));
    }

    private Optional<MediaMessage> mediaMessage(
            String chatId,
            String messageId,
            String senderId,
            Instant timestamp,
            String caption,
            JsonNode media,
            String filename,
            String mimeType
    ) {
        String fileId = text(media.path("file_id"));
        if (fileId.isBlank()) return Optional.empty();
        Long fileSize = media.hasNonNull("file_size")
                ? media.path("file_size").asLong()
                : null;
        return Optional.of(new MediaMessage(
                "telegram:" + chatId + ":" + messageId,
                chatId,
                senderId,
                timestamp,
                fileId,
                fileSize,
                filename,
                mimeType,
                caption));
    }

    private JsonNode message(JsonNode update) {
        JsonNode message = update.path("message");
        return message.isMissingNode() ? update.path("channel_post") : message;
    }

    private String text(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? "" : node.asText("");
    }

    private String nullableText(JsonNode node) {
        String value = text(node);
        return value.isBlank() ? null : value;
    }

    public record MediaMessage(
            String messageId,
            String chatId,
            String senderId,
            Instant timestamp,
            String fileId,
            Long fileSize,
            String filename,
            String mimeType,
            String caption
    ) {
    }

    public record TextMessage(
            String chatId,
            String chatTitle,
            String senderId,
            String text
    ) {
    }

    public record Callback(
            String callbackId,
            String chatId,
            String chatTitle,
            String senderId,
            String data
    ) {
    }

    public record Membership(String chatId, String oldStatus, String newStatus) {
        public boolean joined() {
            return ("member".equals(newStatus) || "administrator".equals(newStatus))
                    && !("member".equals(oldStatus) || "administrator".equals(oldStatus));
        }
    }
}
