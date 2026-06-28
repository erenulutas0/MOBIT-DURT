package com.docsbot.ops.telegram;

import java.util.List;
import java.util.Map;

import tools.jackson.databind.JsonNode;

public interface TelegramGateway {

    List<JsonNode> getUpdates(Long offset);

    DownloadedFile downloadFile(String fileId, Long expectedSize);

    void sendMessage(String chatId, String text);

    void sendMessage(String chatId, String text, Map<String, Object> replyMarkup);

    void answerCallback(String callbackId);

    void registerCommands(List<Map<String, String>> commands);

    boolean isChatAdministrator(String chatId, String userId);

    void configureWebhook(String url, String secret);

    void disableWebhook();

    record DownloadedFile(byte[] content, String contentType) {
    }
}
