package com.docsbot.ops.telegram;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.common.config.DocsBotProperties;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class TelegramWebhookLifecycleTest {

    private final TelegramGateway gateway = mock(TelegramGateway.class);

    @Test
    void rejectsNonHttpsWebhookUrls() {
        TelegramWebhookLifecycle lifecycle = new TelegramWebhookLifecycle(
                gateway,
                properties("http://example.test/webhook/telegram", "0123456789abcdef"));

        assertThrows(IllegalStateException.class, lifecycle::configure);
    }

    @Test
    void rejectsShortWebhookSecrets() {
        TelegramWebhookLifecycle lifecycle = new TelegramWebhookLifecycle(
                gateway,
                properties("https://example.test/webhook/telegram", "short"));

        assertThrows(IllegalStateException.class, lifecycle::configure);
    }

    private DocsBotProperties properties(String url, String secret) {
        return new DocsBotProperties(
                "target/test-data",
                "target/test-vault",
                1024,
                "salt",
                false,
                new DocsBotProperties.WebPush(false, "", "", "", 0),
                new DocsBotProperties.MobilePush(false, "", "", "", "", "https://fcm.googleapis.com", "", "", "", "", "", "sandbox", "", 10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                new DocsBotProperties.Telegram(
                        true,
                        "test-token",
                        "http://127.0.0.1",
                        1,
                        1000,
                        "",
                        "",
                        "webhook",
                        url,
                        secret),
                new DocsBotProperties.Admin("admin", "password", "Admin"),
                new DocsBotProperties.Jwt(
                        "issuer",
                        "01234567890123456789012345678901",
                        15));
    }
}
