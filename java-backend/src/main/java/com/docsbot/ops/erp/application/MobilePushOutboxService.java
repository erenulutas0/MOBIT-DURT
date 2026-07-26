package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;
import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

@Service
@Profile("postgres")
public class MobilePushOutboxService {

    private final ErpMobilePushOutboxRepository outboxRepository;
    private final ErpMobilePushTokenRepository tokenRepository;
    private final ErpNotificationRepository notificationRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;
    private final MobilePushGateway gateway;
    /** Past this age an undelivered alert is stale news; the app's own list is the record. */
    private final Duration maxAge;
    private final Clock clock;

    @Autowired
    public MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            MobilePushGateway gateway,
            @org.springframework.beans.factory.annotation.Value(
                    "${docsbot.mobile-push.max-age-minutes:120}") long maxAgeMinutes
    ) {
        this(outboxRepository, tokenRepository, notificationRepository, deliveryRepository, gateway,
                Duration.ofMinutes(maxAgeMinutes), Clock.systemUTC());
    }

    MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            MobilePushGateway gateway,
            Clock clock
    ) {
        this(outboxRepository, tokenRepository, notificationRepository, deliveryRepository, gateway,
                Duration.ofMinutes(120), clock);
    }

    MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            MobilePushGateway gateway,
            Duration maxAge,
            Clock clock
    ) {
        this.outboxRepository = outboxRepository;
        this.tokenRepository = tokenRepository;
        this.notificationRepository = notificationRepository;
        this.deliveryRepository = deliveryRepository;
        this.gateway = gateway;
        this.maxAge = maxAge;
        this.clock = clock;
    }

    @Scheduled(
            fixedDelayString = "${docsbot.mobile-push.process-delay-ms:15000}",
            initialDelayString = "${docsbot.mobile-push.initial-delay-ms:10000}")
    public void processDueScheduled() {
        processDue();
    }

    @Transactional
    public int enqueue(long notificationId, long tokenId) {
        if (outboxRepository.existsByNotificationIdAndTokenId(notificationId, tokenId)) {
            return 0;
        }
        outboxRepository.save(ErpMobilePushOutbox.create(notificationId, tokenId, clock.instant()));
        return 1;
    }

    @Transactional
    public int processDue() {
        if (!gateway.configured()) {
            return 0;
        }
        Instant now = clock.instant();
        List<ErpMobilePushOutbox> due = outboxRepository
                .findTop50ByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                        List.of(ErpMobilePushOutbox.STATUS_PENDING, ErpMobilePushOutbox.STATUS_RETRY),
                        now);
        int processed = 0;
        for (ErpMobilePushOutbox item : due) {
            processed += processOne(item, now);
        }
        return processed;
    }

    private int processOne(ErpMobilePushOutbox item, Instant now) {
        var token = tokenRepository.findById(item.getTokenId()).orElse(null);
        var notification = notificationRepository.findById(item.getNotificationId()).orElse(null);
        if (token == null || notification == null) {
            item.markDead("Notification or token no longer exists", now);
            return 1;
        }
        if (!token.isActive()) {
            item.markDead("Mobile push token is inactive", now);
            return 1;
        }
        // The queue used to send whatever it was handed, however old and whatever had happened
        // since. So a backlog that built up while delivery was failing would later buzz the phone
        // about alerts the user had ALREADY read in the app — "hepsini okudum ama bildirim gelmeye
        // devam ediyor". A push exists to bring someone to the app; once they have been, or once
        // the alert is too old to act on, delivering it is pure noise.
        if (notification.getReadAt() != null) {
            item.markDead("Notification was already read in-app", now);
            return 1;
        }
        if (notification.getCreatedAt() != null
                && notification.getCreatedAt().isBefore(now.minus(maxAge))) {
            item.markDead("Notification is too old to be worth delivering", now);
            return 1;
        }

        MobilePushGateway.Result result = gateway.send(token, notification);
        if (result.status() == MobilePushGateway.Status.DELIVERED) {
            token.markDelivered(now);
            item.markDelivered(now);
            return 1;
        }

        boolean permanent = result.status() == MobilePushGateway.Status.DEAD;
        token.markFailure(result.errorMessage(), permanent, now);
        deliveryRepository.save(ErpNotificationDelivery.failed(
                notification.getId(),
                "MOBILE_PUSH",
                result.errorMessage(),
                now));
        if (permanent) {
            item.markDead(result.errorMessage(), now);
        } else {
            item.markRetry(result.errorMessage(), nextAttemptAt(item, now), now);
        }
        return 1;
    }

    private Instant nextAttemptAt(ErpMobilePushOutbox item, Instant now) {
        long delaySeconds = Math.min(300, 15L * (item.getAttempts() + 1L));
        return now.plus(Duration.ofSeconds(delaySeconds));
    }
}
