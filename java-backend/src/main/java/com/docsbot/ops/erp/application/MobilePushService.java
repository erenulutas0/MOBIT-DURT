package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;

@Service
@Profile("postgres")
public class MobilePushService {

    private final ErpMobilePushTokenRepository tokenRepository;
    private final ErpNotificationPreferenceRepository preferenceRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;
    private final MobilePushOutboxService outboxService;
    private final Clock clock;

    @Autowired
    public MobilePushService(
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            MobilePushOutboxService outboxService
    ) {
        this(tokenRepository, preferenceRepository, deliveryRepository, outboxService, Clock.systemUTC());
    }

    MobilePushService(
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            MobilePushOutboxService outboxService,
            Clock clock
    ) {
        this.tokenRepository = tokenRepository;
        this.preferenceRepository = preferenceRepository;
        this.deliveryRepository = deliveryRepository;
        this.outboxService = outboxService;
        this.clock = clock;
    }

    @Transactional
    public ErpMobilePushToken register(
            ErpPrincipal principal,
            String platform,
            String deviceId,
            String token,
            String appVersion
    ) {
        long userId = recipientId(principal);
        String normalizedPlatform = normalizePlatform(platform);
        String normalizedDeviceId = normalizeRequired(deviceId, "Device id is required");
        String normalizedToken = normalizeRequired(token, "Push token is required");
        String normalizedAppVersion = normalizeOptional(appVersion);
        Instant now = clock.instant();
        return tokenRepository.findByPlatformAndDeviceId(normalizedPlatform, normalizedDeviceId)
                .map(existing -> {
                    existing.refresh(userId, normalizedToken, normalizedAppVersion, now);
                    return existing;
                })
                .orElseGet(() -> tokenRepository.save(ErpMobilePushToken.create(
                        userId,
                        normalizedPlatform,
                        normalizedDeviceId,
                        normalizedToken,
                        normalizedAppVersion,
                        now)));
    }

    @Transactional
    public void unregister(ErpPrincipal principal, String platform, String deviceId) {
        long userId = recipientId(principal);
        tokenRepository.findByUserIdAndPlatformAndDeviceId(
                        userId,
                        normalizePlatform(platform),
                        normalizeRequired(deviceId, "Device id is required"))
                .ifPresent(token -> token.deactivate(clock.instant()));
    }

    @Transactional
    public int deliver(ErpNotification notification) {
        if (!pushAllowed(notification.getUserId())) {
            return 0;
        }
        var tokens = tokenRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(notification.getUserId());
        Instant now = clock.instant();
        int queued = 0;
        for (ErpMobilePushToken token : tokens) {
            token.markQueued(now);
            deliveryRepository.save(ErpNotificationDelivery.accepted(notification.getId(), "MOBILE_PUSH", now));
            outboxService.enqueue(notification.getId(), token.getId());
            queued++;
        }
        return queued;
    }

    private boolean pushAllowed(long userId) {
        return preferenceRepository.findById(userId)
                .map(preference -> preference.isMobilePushEnabled())
                .orElse(true);
    }

    private long recipientId(ErpPrincipal principal) {
        return principal.admin() ? ErpNotification.ADMIN_RECIPIENT_ID : principal.requireUserId();
    }

    private String normalizePlatform(String value) {
        String normalized = normalizeRequired(value, "Platform is required").toLowerCase(Locale.ROOT);
        if (!normalized.equals("android") && !normalized.equals("ios")) {
            throw new ErpExceptions.BadRequest("Platform must be android or ios");
        }
        return normalized;
    }

    private String normalizeRequired(String value, String message) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            throw new ErpExceptions.BadRequest(message);
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : String.join(" ", value.trim().split("\\s+"));
    }
}
