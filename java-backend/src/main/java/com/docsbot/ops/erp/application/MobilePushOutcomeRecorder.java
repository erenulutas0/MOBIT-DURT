package com.docsbot.ops.erp.application;

import java.time.Instant;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;

/**
 * Writes what happened to one queued push, in a transaction of its own.
 *
 * <p>It has to be a separate bean because the drain that calls it has no transaction to join. The
 * scheduled entry point invokes the @Transactional drain on itself, which never reaches Spring's
 * proxy, so every status change made by dirty checking was discarded — while the one thing written
 * through an explicit repository.save(), the delivery record, survived. Production wore the shape
 * of exactly that asymmetry: 4,004 delivery rows saying "FCM rejected token with HTTP 404", and at
 * the same time twenty-three tokens still marked active with last_failure_at never once set. A
 * token FCM has already refused stayed alive, was retried forever, and earned 390 HTTP 429s that
 * throttled the real notifications queued behind it. Four hundred of those have sat undelivered
 * since 27 July.
 *
 * <p>Entities are re-read by id here rather than handed in: the caller's copies are detached, which
 * is the whole problem, and writing them from a second context would only move it.
 *
 * <p>The send itself stays outside these transactions on purpose. Holding a database connection
 * across an FCM call — fifty of them per batch — is how this project has exhausted its pool before.
 */
@Service
@Profile("postgres")
public class MobilePushOutcomeRecorder {

    private final ErpMobilePushOutboxRepository outboxRepository;
    private final ErpMobilePushTokenRepository tokenRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;

    public MobilePushOutcomeRecorder(
            ErpMobilePushOutboxRepository outboxRepository,
            ErpMobilePushTokenRepository tokenRepository,
            ErpNotificationDeliveryRepository deliveryRepository
    ) {
        this.outboxRepository = outboxRepository;
        this.tokenRepository = tokenRepository;
        this.deliveryRepository = deliveryRepository;
    }

    /** The queued push will never be worth sending: the row is closed and nothing is retried. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordDead(long itemId, String reason, Instant now) {
        outboxRepository.findById(itemId).ifPresent(item -> {
            item.markDead(reason, now);
            outboxRepository.saveAndFlush(item);
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordDelivered(long itemId, long tokenId, Instant now) {
        outboxRepository.findById(itemId).ifPresent(item -> {
            item.markDelivered(now);
            outboxRepository.saveAndFlush(item);
        });
        tokenRepository.findById(tokenId).ifPresent(token -> {
            token.markDelivered(now);
            tokenRepository.saveAndFlush(token);
        });
    }

    /**
     * A send that failed. {@code permanent} means FCM refused the token itself — the token is
     * deactivated and the queued push is closed rather than retried, which is what stops a dead
     * device from consuming the quota that everybody else's notifications need.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(
            long itemId,
            long tokenId,
            long notificationId,
            String error,
            boolean permanent,
            Instant nextAttemptAt,
            Instant now
    ) {
        deliveryRepository.save(ErpNotificationDelivery.failed(notificationId, "MOBILE_PUSH", error, now));
        tokenRepository.findById(tokenId).ifPresent(token -> {
            token.markFailure(error, permanent, now);
            tokenRepository.saveAndFlush(token);
        });
        outboxRepository.findById(itemId).ifPresent(item -> {
            if (permanent) {
                item.markDead(error, now);
            } else {
                item.markRetry(error, nextAttemptAt, now);
            }
            outboxRepository.saveAndFlush(item);
        });
    }
}
