package com.docsbot.ops.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "docsbot")
public record DocsBotProperties(
        String dataDir,
        String vaultDir,
        long maxFileSizeBytes,
        String phoneHashSalt,
        boolean production,
        WebPush webPush,
        MobilePush mobilePush,
        Email email,
        AppUpdate appUpdate,
        Telegram telegram,
        Admin admin,
        Jwt jwt
) {
    public record WebPush(
            boolean enabled,
            String publicKey,
            String privateKey,
            String subject,
            int ttlSeconds
    ) {
        public boolean configured() {
            return enabled
                    && publicKey != null && !publicKey.isBlank()
                    && privateKey != null && !privateKey.isBlank();
        }
    }

    public record MobilePush(
            boolean enabled,
            String fcmProjectId,
            String fcmAccessToken,
            String fcmServiceAccountJson,
            String fcmServiceAccountPath,
            String fcmApiBaseUrl,
            String apnsTeamId,
            String apnsKeyId,
            String apnsBundleId,
            String apnsPrivateKey,
            String apnsPrivateKeyPath,
            String apnsEnvironment,
            String apnsApiBaseUrl,
            int timeoutSeconds
    ) {
        public boolean configured() {
            return fcmConfigured() || apnsConfigured();
        }

        public boolean fcmConfigured() {
            return enabled
                    && fcmProjectId != null && !fcmProjectId.isBlank()
                    && ((fcmAccessToken != null && !fcmAccessToken.isBlank())
                    || (fcmServiceAccountJson != null && !fcmServiceAccountJson.isBlank())
                    || (fcmServiceAccountPath != null && !fcmServiceAccountPath.isBlank()));
        }

        public boolean apnsConfigured() {
            return enabled
                    && apnsTeamId != null && !apnsTeamId.isBlank()
                    && apnsKeyId != null && !apnsKeyId.isBlank()
                    && apnsBundleId != null && !apnsBundleId.isBlank()
                    && ((apnsPrivateKey != null && !apnsPrivateKey.isBlank())
                    || (apnsPrivateKeyPath != null && !apnsPrivateKeyPath.isBlank()));
        }
    }

    public record Email(
            boolean enabled,
            boolean dryRun,
            String from,
            String adminTo,
            String subjectPrefix
    ) {
    }

    public record AppUpdate(
            String latestVersion,
            String minimumVersion,
            String title,
            String message,
            String playStoreUrl
    ) {
    }

    public record Telegram(
            boolean enabled,
            String token,
            String apiBaseUrl,
            int pollTimeoutSeconds,
            long pollDelayMs,
            String allowedChatIds,
            String adminUserIds,
            String mode,
            String webhookUrl,
            String webhookSecret
    ) {
    }

    public record Admin(String username, String password, String displayName) {
    }

    public record Jwt(String issuer, String secret, long accessTokenMinutes) {
    }
}
