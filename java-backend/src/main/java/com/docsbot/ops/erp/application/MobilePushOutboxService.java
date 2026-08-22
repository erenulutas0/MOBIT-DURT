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
    private final MobilePushGateway gateway;
    /** Writes each outcome in its own transaction, because this drain runs without one. */
    private final MobilePushOutcomeRecorder outcomeRecorder;
    /** Past this age an undelivered alert is stale news; the app's own list is the record. */
    private final Duration maxAge;
    private final Clock clock;

    @Autowired
    public MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            MobilePushGateway gateway,
            MobilePushOutcomeRecorder outcomeRecorder,
            @org.springframework.beans.factory.annotation.Value(
                    "${docsbot.mobile-push.max-age-minutes:120}") long maxAgeMinutes
    ) {
        this(outboxRepository, tokenRepository, notificationRepository, gateway,
                outcomeRecorder, Duration.ofMinutes(maxAgeMinutes), Clock.systemUTC());
    }

    MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            MobilePushGateway gateway,
            MobilePushOutcomeRecorder outcomeRecorder,
            Clock clock
    ) {
        this(outboxRepository, tokenRepository, notificationRepository, gateway,
                outcomeRecorder, Duration.ofMinutes(120), clock);
    }

    MobilePushOutboxService(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationRepository notificationRepository,
            MobilePushGateway gateway,
            MobilePushOutcomeRecorder outcomeRecorder,
            Duration maxAge,
            Clock clock
    ) {
        this.outboxRepository = outboxRepository;
        this.tokenRepository = tokenRepository;
        this.notificationRepository = notificationRepository;
        this.gateway = gateway;
        this.outcomeRecorder = outcomeRecorder;
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

    /**
     * Deliberately not @Transactional, and the scheduled entry point above deliberately does not
     * wrap it either. Every outcome is written by MobilePushOutcomeRecorder in a transaction of its
     * own, so this method needs none — and giving it one would put up to fifty FCM calls inside a
     * single transaction, holding a database connection for the whole batch. The annotation used to
     * be here and never applied: the scheduled method calls this one on itself, which never reaches
     * Spring's proxy, so no transaction was ever started and every status change made by dirty
     * checking was silently discarded.
     */
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
            outcomeRecorder.recordDead(item.getId(), "Notification or token no longer exists", now);
            return 1;
        }
        if (!token.isActive()) {
            outcomeRecorder.recordDead(item.getId(), "Mobile push token is inactive", now);
            return 1;
        }
        // The queue used to send whatever it was handed, however old and whatever had happened
        // since. So a backlog that built up while delivery was failing would later buzz the phone
        // about alerts the user had ALREADY read in the app — "hepsini okudum ama bildirim gelmeye
        // devam ediyor". A push exists to bring someone to the app; once they have been, or once
        // the alert is too old to act on, delivering it is pure noise.
        if (notification.getReadAt() != null) {
            outcomeRecorder.recordDead(item.getId(), "Notification was already read in-app", now);
            return 1;
        }
        if (notification.getCreatedAt() != null
                && notification.getCreatedAt().isBefore(now.minus(maxAge))) {
            outcomeRecorder.recordDead(
                    item.getId(), "Notification is too old to be worth delivering", now);
            return 1;
        }

        MobilePushGateway.Result result = gateway.send(token, notification);
        // Sent outside any transaction, on purpose: holding a connection across fifty FCM calls
        // is how this project has exhausted its pool before. Only the outcome is written back.
        if (result.status() == MobilePushGateway.Status.DELIVERED) {
            outcomeRecorder.recordDelivered(item.getId(), token.getId(), now);
            return 1;
        }

        boolean permanent = result.status() == MobilePushGateway.Status.DEAD;
        outcomeRecorder.recordFailure(
                item.getId(),
                token.getId(),
                notification.getId(),
                result.errorMessage(),
                permanent,
                nextAttemptAt(item, now),
                now);
        return 1;
    }

    private Instant nextAttemptAt(ErpMobilePushOutbox item, Instant now) {
        long delaySeconds = Math.min(300, 15L * (item.getAttempts() + 1L));
        return now.plus(Duration.ofSeconds(delaySeconds));
    }
}
