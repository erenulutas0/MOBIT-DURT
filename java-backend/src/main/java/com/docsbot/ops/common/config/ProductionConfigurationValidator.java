package com.docsbot.ops.common.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ProductionConfigurationValidator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ProductionConfigurationValidator.class);

    private final DocsBotProperties properties;

    public ProductionConfigurationValidator(DocsBotProperties properties) {
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> errors = validateProduction(properties);
        if (properties.production()) {
            if (!errors.isEmpty()) {
                throw new IllegalStateException("Invalid production configuration: " + String.join("; ", errors));
            }
            log.info("Production configuration validation passed");
            return;
        }

        if (!errors.isEmpty()) {
            log.warn("DOCSBOT_PRODUCTION is false; production configuration validation is warn-only: {}",
                    String.join("; ", errors));
        }
    }

    static List<String> validateProduction(DocsBotProperties properties) {
        List<String> errors = new ArrayList<>();
        validateCoreSecrets(properties, errors);
        validateTelegram(properties.telegram(), errors);
        validateWebPush(properties.webPush(), errors);
        validateMobilePush(properties.mobilePush(), errors);
        validateEmail(properties.email(), errors);
        return errors;
    }

    private static void validateCoreSecrets(DocsBotProperties properties, List<String> errors) {
        if (blank(properties.dataDir())) {
            errors.add("DATA_DIR must be configured");
        }
        if (blank(properties.vaultDir())) {
            errors.add("VAULT_DIR must be configured");
        }
        if (weak(properties.phoneHashSalt(), 16, "change-me-local-salt")) {
            errors.add("PHONE_HASH_SALT must be a non-default secret with at least 16 characters");
        }
        if (properties.jwt() == null || weak(properties.jwt().secret(), 32,
                "local-development-secret-change-me-32-bytes")) {
            errors.add("DOCSBOT_JWT_SECRET must be a non-default secret with at least 32 characters");
        }
        if (properties.admin() == null || weak(properties.admin().password(), 12,
                "admin123", "password", "change-this-admin-password")) {
            errors.add("ERP_ADMIN_PASSWORD must be a non-default password with at least 12 characters");
        }
    }

    private static void validateTelegram(DocsBotProperties.Telegram telegram, List<String> errors) {
        if (telegram == null || !telegram.enabled()) {
            return;
        }
        if (weak(telegram.token(), 16, "replace-with-telegram-bot-token")) {
            errors.add("TELEGRAM_BOT_TOKEN must be configured when Telegram is enabled");
        }
        if (blank(telegram.allowedChatIds())) {
            errors.add("TELEGRAM_ALLOWED_CHAT_IDS must restrict production Telegram ingestion");
        }
        if (blank(telegram.adminUserIds())) {
            errors.add("TELEGRAM_ADMIN_USER_IDS must restrict production catalog writes");
        }

        String mode = normalized(telegram.mode());
        if (!"polling".equals(mode) && !"webhook".equals(mode)) {
            errors.add("TELEGRAM_MODE must be either polling or webhook");
        }
        if ("webhook".equals(mode)) {
            if (!httpsUrl(telegram.webhookUrl())) {
                errors.add("TELEGRAM_WEBHOOK_URL must be an HTTPS public URL in webhook mode");
            }
            if (weak(telegram.webhookSecret(), 16, "replace-with-a-random-secret")) {
                errors.add("TELEGRAM_WEBHOOK_SECRET must be a non-default secret with at least 16 characters");
            }
        }
    }

    private static void validateWebPush(DocsBotProperties.WebPush webPush, List<String> errors) {
        if (webPush == null || !webPush.enabled()) {
            return;
        }
        if (weak(webPush.publicKey(), 24, "replace-with-web-push-public-key")) {
            errors.add("DOCSBOT_WEB_PUSH_PUBLIC_KEY must be configured when Web Push is enabled");
        }
        if (weak(webPush.privateKey(), 24, "replace-with-web-push-private-key")) {
            errors.add("DOCSBOT_WEB_PUSH_PRIVATE_KEY must be configured when Web Push is enabled");
        }
        String subject = normalized(webPush.subject());
        if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
            errors.add("DOCSBOT_WEB_PUSH_SUBJECT must start with mailto: or https://");
        }
    }

    private static void validateMobilePush(DocsBotProperties.MobilePush mobilePush, List<String> errors) {
        if (mobilePush == null || !mobilePush.enabled()) {
            return;
        }
        if (blank(mobilePush.fcmProjectId())) {
            errors.add("DOCSBOT_FCM_PROJECT_ID must be configured when Mobile Push is enabled");
        }
        boolean hasStaticToken = !weak(mobilePush.fcmAccessToken(), 24, "replace-with-fcm-access-token");
        boolean hasServiceAccountJson = !blank(mobilePush.fcmServiceAccountJson());
        boolean hasServiceAccountPath = !blank(mobilePush.fcmServiceAccountPath());
        if (!hasStaticToken && !hasServiceAccountJson && !hasServiceAccountPath) {
            errors.add("DOCSBOT_FCM_ACCESS_TOKEN or FCM service account credentials must be configured when Mobile Push is enabled");
        }
        boolean hasAnyApns = !blank(mobilePush.apnsTeamId())
                || !blank(mobilePush.apnsKeyId())
                || !blank(mobilePush.apnsBundleId())
                || !blank(mobilePush.apnsPrivateKey())
                || !blank(mobilePush.apnsPrivateKeyPath());
        if (hasAnyApns && !mobilePush.apnsConfigured()) {
            errors.add("DOCSBOT_APNS_TEAM_ID, DOCSBOT_APNS_KEY_ID, DOCSBOT_APNS_BUNDLE_ID, and APNs private key must all be configured for iOS push");
        }
        String apnsEnvironment = normalized(mobilePush.apnsEnvironment());
        if (hasAnyApns && !"sandbox".equals(apnsEnvironment) && !"production".equals(apnsEnvironment)) {
            errors.add("DOCSBOT_APNS_ENVIRONMENT must be sandbox or production");
        }
    }

    private static void validateEmail(DocsBotProperties.Email email, List<String> errors) {
        if (email == null || !email.enabled()) {
            return;
        }
        if (blank(email.from())) {
            errors.add("DOCSBOT_EMAIL_FROM must be configured when email fallback is enabled");
        }
        if (blank(email.adminTo())) {
            errors.add("DOCSBOT_EMAIL_ADMIN_TO must be configured for production escalations");
        }
        if (email.dryRun()) {
            errors.add("DOCSBOT_EMAIL_DRY_RUN must be false in production when email fallback is enabled");
        }
    }

    private static boolean weak(String value, int minLength, String... defaults) {
        if (blank(value) || value.trim().length() < minLength) {
            return true;
        }
        String normalized = normalized(value);
        if (normalized.contains("replace-with") || normalized.contains("change-me")) {
            return true;
        }
        for (String defaultValue : defaults) {
            if (normalized.equals(normalized(defaultValue))) {
                return true;
            }
        }
        return false;
    }

    private static boolean httpsUrl(String value) {
        if (blank(value)) {
            return false;
        }
        try {
            URI uri = URI.create(value.trim());
            return "https".equalsIgnoreCase(uri.getScheme())
                    && !blank(uri.getHost());
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String normalized(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
