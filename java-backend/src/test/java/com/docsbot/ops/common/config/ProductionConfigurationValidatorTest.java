package com.docsbot.ops.common.config;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductionConfigurationValidatorTest {

    @Test
    void rejectsProductionPlaceholderSecretsAndWebhookMisconfiguration() {
        DocsBotProperties properties = new DocsBotProperties(
                "../data",
                "../vault",
                1024,
                "change-me-local-salt",
                true,
                new DocsBotProperties.WebPush(
                        true,
                        "replace-with-web-push-public-key",
                        "",
                        "admin@example.com",
                        86400),
                new DocsBotProperties.MobilePush(
                        true,
                        "",
                        "replace-with-fcm-access-token",
                        "",
                        "",
                        "https://fcm.googleapis.com",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "sandbox",
                        "",
                        10),
                new DocsBotProperties.Email(
                        true,
                        true,
                        "docsbot@example.com",
                        "",
                        "[DocsBot Ops]"),
                null,
                new DocsBotProperties.AppUpdate(
                        "1.0.7",
                        "1.0.6",
                        "Yeni versiyon geldi",
                        "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
                        "https://play.google.com/store/apps/details?id=com.mobit.docsbotops"),
                new DocsBotProperties.Telegram(
                        true,
                        "replace-with-telegram-bot-token",
                        "https://api.telegram.org",
                        25,
                        1000,
                        "",
                        "",
                        "webhook",
                        "http://example.test/webhook/telegram",
                        "short"),
                new DocsBotProperties.Admin("admin", "admin123", "Admin"),
                new DocsBotProperties.Jwt(
                        "docsbot-ops",
                        "local-development-secret-change-me-32-bytes",
                        60));

        List<String> errors = ProductionConfigurationValidator.validateProduction(properties);

        assertTrue(contains(errors, "PHONE_HASH_SALT"));
        assertTrue(contains(errors, "DOCSBOT_JWT_SECRET"));
        assertTrue(contains(errors, "ERP_ADMIN_PASSWORD"));
        assertTrue(contains(errors, "TELEGRAM_BOT_TOKEN"));
        assertTrue(contains(errors, "TELEGRAM_ALLOWED_CHAT_IDS"));
        assertTrue(contains(errors, "TELEGRAM_ADMIN_USER_IDS"));
        assertTrue(contains(errors, "TELEGRAM_WEBHOOK_URL"));
        assertTrue(contains(errors, "TELEGRAM_WEBHOOK_SECRET"));
        assertTrue(contains(errors, "DOCSBOT_WEB_PUSH_PUBLIC_KEY"));
        assertTrue(contains(errors, "DOCSBOT_WEB_PUSH_PRIVATE_KEY"));
        assertTrue(contains(errors, "DOCSBOT_WEB_PUSH_SUBJECT"));
        assertTrue(contains(errors, "DOCSBOT_FCM_PROJECT_ID"));
        assertTrue(contains(errors, "FCM service account credentials"));
        assertTrue(contains(errors, "DOCSBOT_EMAIL_ADMIN_TO"));
        assertTrue(contains(errors, "DOCSBOT_EMAIL_DRY_RUN"));
    }

    @Test
    void acceptsProductionReadyConfiguration() {
        DocsBotProperties properties = new DocsBotProperties(
                "/srv/docsbot/data",
                "/srv/docsbot/vault",
                25 * 1024 * 1024,
                "production-phone-salt-0123456789",
                true,
                new DocsBotProperties.WebPush(
                        true,
                        "BPuBlicVapidKeyValueThatIsLongEnough",
                        "privateVapidKeyValueThatIsLongEnough",
                        "mailto:ops@example.com",
                        86400),
                new DocsBotProperties.MobilePush(
                        true,
                        "docsbot-prod",
                        "",
                        "{\"client_email\":\"firebase-adminsdk@example.iam.gserviceaccount.com\",\"private_key\":\"-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n\"}",
                        "",
                        "https://fcm.googleapis.com",
                        "TEAM123456",
                        "KEY1234567",
                        "com.mobit.docsbot",
                        "-----BEGIN PRIVATE KEY-----\\napns-key\\n-----END PRIVATE KEY-----\\n",
                        "",
                        "production",
                        "",
                        10),
                new DocsBotProperties.Email(
                        true,
                        false,
                        "docsbot@example.com",
                        "ops@example.com",
                        "[DocsBot Ops]"),
                null,
                new DocsBotProperties.AppUpdate(
                        "1.0.7",
                        "1.0.6",
                        "Yeni versiyon geldi",
                        "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
                        "https://play.google.com/store/apps/details?id=com.mobit.docsbotops"),
                new DocsBotProperties.Telegram(
                        true,
                        "123456789:realisticTelegramBotTokenValue",
                        "https://api.telegram.org",
                        25,
                        1000,
                        "-1001234567890",
                        "123456789",
                        "webhook",
                        "https://ops.example.com/webhook/telegram",
                        "telegram-webhook-secret-0123456789"),
                new DocsBotProperties.Admin("admin", "StrongAdminPassword123!", "Admin"),
                new DocsBotProperties.Jwt(
                        "docsbot-ops",
                        "jwt-secret-with-more-than-thirty-two-characters",
                        60));

        assertEquals(List.of(), ProductionConfigurationValidator.validateProduction(properties));
    }

    private static boolean contains(List<String> errors, String text) {
        return errors.stream().anyMatch(error -> error.contains(text));
    }
}
