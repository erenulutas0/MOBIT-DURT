package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;

@Service
@Profile("postgres")
public class AppUpdateService {

    private final DocsBotProperties properties;
    private final ErpMobilePushTokenRepository tokenRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Autowired
    public AppUpdateService(
            DocsBotProperties properties,
            ErpMobilePushTokenRepository tokenRepository,
            NotificationService notificationService
    ) {
        this(properties, tokenRepository, notificationService, Clock.systemUTC());
    }

    AppUpdateService(
            DocsBotProperties properties,
            ErpMobilePushTokenRepository tokenRepository,
            NotificationService notificationService,
            Clock clock
    ) {
        this.properties = properties;
        this.tokenRepository = tokenRepository;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    public AppUpdateInfo info(String currentVersion) {
        var config = appUpdateConfig();
        String latestVersion = normalizeVersion(config.latestVersion(), "1.0.7");
        String minimumVersion = normalizeVersion(config.minimumVersion(), "1.0.7");
        String normalizedCurrent = normalizeVersion(currentVersion, "0.0.0");
        boolean updateAvailable = compareVersions(normalizedCurrent, latestVersion) < 0;
        boolean required = compareVersions(normalizedCurrent, minimumVersion) < 0;
        return new AppUpdateInfo(
                normalizedCurrent,
                latestVersion,
                minimumVersion,
                updateAvailable,
                required,
                text(config.title(), "Yeni versiyon geldi"),
                text(config.message(), required
                        ? "Uygulamayı düzgün kullanmanız için güncellemeniz gerekmektedir."
                        : "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor."),
                text(config.playStoreUrl(), "https://play.google.com/store/apps/details?id=com.mobit.docsbotops"));
    }

    @Transactional
    public AppUpdateBroadcastResult broadcast(ErpPrincipal principal, String requestedLatestVersion) {
        if (!principal.admin()) {
            throw new ErpExceptions.Forbidden("Admin access is required");
        }
        AppUpdateInfo update = info("0.0.0");
        String latestOverride = normalizeOptional(requestedLatestVersion);
        if (latestOverride != null) {
            update = new AppUpdateInfo(
                    update.currentVersion(),
                    normalizeVersion(latestOverride, update.latestVersion()),
                    update.minimumVersion(),
                    true,
                    update.required(),
                    update.title(),
                    update.message(),
                    update.playStoreUrl());
        }
        Instant now = clock.instant();
        String eventKey = "app-update:" + update.latestVersion();
        List<Long> recipientIds = tokenRepository.findDistinctActiveUserIds();
        int userNotifications = notificationService.notifyUsers(
                recipientIds.stream()
                        .filter(userId -> userId != ErpNotification.ADMIN_RECIPIENT_ID)
                        .toList(),
                "app_update_available",
                update.title(),
                update.message(),
                null,
                update.required() ? "HIGH" : "NORMAL",
                eventKey,
                now);
        int adminNotifications = recipientIds.contains(ErpNotification.ADMIN_RECIPIENT_ID)
                ? notificationService.notifyAdmin(
                        "app_update_available",
                        update.title(),
                        update.message(),
                        null,
                        update.required() ? "HIGH" : "NORMAL",
                        eventKey,
                        now)
                : 0;
        return new AppUpdateBroadcastResult(
                update.latestVersion(),
                recipientIds.size(),
                userNotifications + adminNotifications);
    }

    private DocsBotProperties.AppUpdate appUpdateConfig() {
        if (properties.appUpdate() != null) {
            return properties.appUpdate();
        }
        return new DocsBotProperties.AppUpdate(
                "1.0.7",
                "1.0.7",
                "Yeni versiyon geldi",
                "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
                "https://play.google.com/store/apps/details?id=com.mobit.docsbotops");
    }

    private String normalizeVersion(String version, String fallback) {
        String value = text(version, fallback).trim();
        return value.startsWith("v") || value.startsWith("V") ? value.substring(1) : value;
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String text(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private int compareVersions(String left, String right) {
        int[] leftParts = versionParts(left);
        int[] rightParts = versionParts(right);
        int length = Math.max(leftParts.length, rightParts.length);
        for (int index = 0; index < length; index++) {
            int leftValue = index < leftParts.length ? leftParts[index] : 0;
            int rightValue = index < rightParts.length ? rightParts[index] : 0;
            if (leftValue != rightValue) {
                return Integer.compare(leftValue, rightValue);
            }
        }
        return 0;
    }

    private int[] versionParts(String version) {
        String normalized = version.toLowerCase(Locale.ROOT).replaceAll("[^0-9.]", "");
        if (normalized.isBlank()) {
            return new int[] {0};
        }
        return java.util.Arrays.stream(normalized.split("\\."))
                .filter(part -> !part.isBlank())
                .mapToInt(part -> {
                    try {
                        return Integer.parseInt(part);
                    } catch (NumberFormatException exception) {
                        return 0;
                    }
                })
                .toArray();
    }

    public record AppUpdateInfo(
            String currentVersion,
            String latestVersion,
            String minimumVersion,
            boolean updateAvailable,
            boolean required,
            String title,
            String message,
            String playStoreUrl
    ) {
    }

    public record AppUpdateBroadcastResult(
            String latestVersion,
            int activeDeviceUsers,
            int notificationsCreated
    ) {
    }
}
