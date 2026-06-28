package com.docsbot.ops.telegram;

import jakarta.annotation.PostConstruct;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;

@Component
@Profile("postgres")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "enabled",
        havingValue = "true")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "mode",
        havingValue = "webhook")
public class TelegramWebhookLifecycle {

    private final TelegramGateway gateway;
    private final String webhookUrl;
    private final String webhookSecret;

    public TelegramWebhookLifecycle(
            TelegramGateway gateway,
            DocsBotProperties properties
    ) {
        this.gateway = gateway;
        this.webhookUrl = normalize(properties.telegram().webhookUrl());
        this.webhookSecret = normalize(properties.telegram().webhookSecret());
    }

    @PostConstruct
    void configure() {
        if (!webhookUrl.startsWith("https://")) {
            throw new IllegalStateException(
                    "Telegram webhook mode requires an HTTPS TELEGRAM_WEBHOOK_URL");
        }
        if (webhookSecret.length() < 16) {
            throw new IllegalStateException(
                    "Telegram webhook mode requires TELEGRAM_WEBHOOK_SECRET with at least 16 characters");
        }
        gateway.configureWebhook(webhookUrl, webhookSecret);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
