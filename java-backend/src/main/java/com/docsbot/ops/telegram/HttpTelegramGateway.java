package com.docsbot.ops.telegram;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("postgres")
public class HttpTelegramGateway implements TelegramGateway {

    private final HttpClient client;
    private final ObjectMapper objectMapper;
    private final String apiUrl;
    private final String fileUrl;
    private final int pollTimeoutSeconds;
    private final long maxFileSizeBytes;

    public HttpTelegramGateway(
            ObjectMapper objectMapper,
            DocsBotProperties properties
    ) {
        this.objectMapper = objectMapper;
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        DocsBotProperties.Telegram telegram = properties.telegram();
        String token = telegram.token() == null ? "" : telegram.token().trim();
        String base = telegram.apiBaseUrl().replaceAll("/+$", "");
        this.apiUrl = base + "/bot" + token;
        this.fileUrl = base + "/file/bot" + token;
        this.pollTimeoutSeconds = Math.max(1, telegram.pollTimeoutSeconds());
        this.maxFileSizeBytes = properties.maxFileSizeBytes();
    }

    @Override
    public List<JsonNode> getUpdates(Long offset) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("timeout", pollTimeoutSeconds);
        payload.put("allowed_updates", List.of(
                "message",
                "channel_post",
                "callback_query",
                "my_chat_member"));
        if (offset != null) payload.put("offset", offset);
        JsonNode result = telegramPost("/getUpdates", payload).path("result");
        if (!result.isArray()) return List.of();
        return java.util.stream.StreamSupport.stream(result.spliterator(), false).toList();
    }

    @Override
    public DownloadedFile downloadFile(String fileId, Long expectedSize) {
        JsonNode result = telegramPost("/getFile", Map.of("file_id", fileId)).path("result");
        String filePath = result.path("file_path").asText("");
        long metadataSize = result.path("file_size").asLong(expectedSize == null ? -1 : expectedSize);
        if (filePath.isBlank()) {
            throw new TelegramException("Telegram file metadata did not include a path");
        }
        if (metadataSize > maxFileSizeBytes) {
            throw new TelegramException("Telegram file exceeds the configured size limit");
        }
        HttpResponse<byte[]> response = send(HttpRequest.newBuilder()
                .uri(URI.create(fileUrl + "/" + filePath))
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build(), HttpResponse.BodyHandlers.ofByteArray());
        if (response.body().length > maxFileSizeBytes) {
            throw new TelegramException("Telegram file exceeds the configured size limit");
        }
        if (metadataSize >= 0 && response.body().length != metadataSize) {
            throw new TelegramException("Downloaded Telegram file size did not match metadata");
        }
        String contentType = response.headers()
                .firstValue("content-type")
                .map(value -> value.split(";", 2)[0].trim())
                .orElse("application/octet-stream");
        return new DownloadedFile(response.body(), contentType);
    }

    @Override
    public void sendMessage(String chatId, String text) {
        sendMessage(chatId, text, null);
    }

    @Override
    public void sendMessage(
            String chatId,
            String text,
            Map<String, Object> replyMarkup
    ) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("chat_id", chatId);
        payload.put("text", text);
        if (replyMarkup != null) payload.put("reply_markup", replyMarkup);
        telegramPost("/sendMessage", payload);
    }

    @Override
    public void answerCallback(String callbackId) {
        telegramPost("/answerCallbackQuery", Map.of("callback_query_id", callbackId));
    }

    @Override
    public void registerCommands(List<Map<String, String>> commands) {
        telegramPost("/setMyCommands", Map.of("commands", commands));
    }

    @Override
    public boolean isChatAdministrator(String chatId, String userId) {
        JsonNode result = telegramPost(
                "/getChatMember",
                Map.of("chat_id", chatId, "user_id", userId));
        String status = result.path("result").path("status").asText("");
        return "creator".equals(status) || "administrator".equals(status);
    }

    @Override
    public void configureWebhook(String url, String secret) {
        telegramPost("/setWebhook", Map.of(
                "url", url,
                "secret_token", secret,
                "allowed_updates", List.of(
                        "message",
                        "channel_post",
                        "callback_query",
                        "my_chat_member"),
                "drop_pending_updates", false));
    }

    @Override
    public void disableWebhook() {
        telegramPost("/deleteWebhook", Map.of("drop_pending_updates", false));
    }

    private JsonNode telegramPost(String path, Object payload) {
        String body;
        try {
            body = objectMapper.writeValueAsString(payload);
        } catch (JacksonException exception) {
            throw new TelegramException("Telegram request could not be encoded", exception);
        }
        HttpResponse<String> response = send(HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + path))
                .timeout(Duration.ofSeconds(pollTimeoutSeconds + 10L))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(), HttpResponse.BodyHandlers.ofString());
        try {
            JsonNode decoded = objectMapper.readTree(response.body());
            if (!decoded.path("ok").asBoolean(false)) {
                throw new TelegramException(
                        decoded.path("description").asText("Telegram API returned an error"));
            }
            return decoded;
        } catch (JacksonException exception) {
            throw new TelegramException("Telegram response could not be decoded", exception);
        }
    }

    private <T> HttpResponse<T> send(
            HttpRequest request,
            HttpResponse.BodyHandler<T> handler
    ) {
        try {
            HttpResponse<T> response = client.send(request, handler);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new TelegramException(
                        "Telegram API request failed with status " + response.statusCode());
            }
            return response;
        } catch (IOException exception) {
            throw new TelegramException("Telegram API request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new TelegramException("Telegram API request was interrupted", exception);
        }
    }

    public static class TelegramException extends RuntimeException {
        public TelegramException(String message) {
            super(message);
        }

        public TelegramException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
