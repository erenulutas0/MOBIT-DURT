package com.docsbot.ops.erp.application;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

import static org.assertj.core.api.Assertions.assertThat;

// Uses the real Spring-managed RetentionService (so its @Transactional @Modifying purges run in a
// transaction) with the default retention windows (activity 180d, push-outbox 30d). Rows are
// backdated relative to now so the cutoffs classify them deterministically; assertions are scoped
// to the specific rows inserted so pre-existing data in the shared test DB is irrelevant.
@SpringBootTest
@ActiveProfiles("postgres")
class RetentionServiceIntegrationTest {

    @Autowired
    private RetentionService retentionService;

    @Autowired
    private ErpActivityEventRepository activityEventRepository;

    @Autowired
    private ErpMobilePushOutboxRepository outboxRepository;

    @Autowired
    private ErpNotificationRepository notificationRepository;

    @Autowired
    private ErpMobilePushTokenRepository tokenRepository;

    @Test
    void purgeActivityEventsDeletesOnlyRowsOlderThanTheWindow() {
        Instant now = Instant.now();
        long oldId = activityEventRepository.save(activityEvent(now.minus(Duration.ofDays(200)))).getId();
        long recentId = activityEventRepository.save(activityEvent(now.minus(Duration.ofDays(1)))).getId();

        int deleted = retentionService.purgeActivityEvents();

        assertThat(deleted).isGreaterThanOrEqualTo(1);
        assertThat(activityEventRepository.findById(oldId)).isEmpty();
        assertThat(activityEventRepository.findById(recentId)).isPresent();
    }

    @Test
    void purgePushOutboxDeletesOldTerminalRowsButKeepsPendingAndRecent() {
        Instant now = Instant.now();
        long notificationId = notificationRepository.save(ErpNotification.create(
                7L, "task_due_soon", "Deadline yaklaşıyor", "Örnek görev", 7L, "HIGH",
                "retention-test:" + now.toEpochMilli(), now)).getId();

        // The unique (notification_id, token_id) index means each outbox row needs its own token.
        long oldDeliveredId = outboxRepository.save(terminalOutbox(
                notificationId, tokenId("old-delivered", now), now.minus(Duration.ofDays(40)))).getId();
        long oldPendingId = outboxRepository.save(ErpMobilePushOutbox.create(
                notificationId, tokenId("old-pending", now), now.minus(Duration.ofDays(40)))).getId();
        long recentDeliveredId = outboxRepository.save(terminalOutbox(
                notificationId, tokenId("recent-delivered", now), now.minus(Duration.ofDays(1)))).getId();

        int deleted = retentionService.purgePushOutbox();

        assertThat(deleted).isGreaterThanOrEqualTo(1);
        assertThat(outboxRepository.findById(oldDeliveredId)).isEmpty();
        assertThat(outboxRepository.findById(oldPendingId)).isPresent();     // PENDING is not terminal
        assertThat(outboxRepository.findById(recentDeliveredId)).isPresent(); // within the window
    }

    private ErpActivityEvent activityEvent(Instant createdAt) {
        return ErpActivityEvent.create(
                "ADMIN", null, "Admin", "RETENTION_TEST", "TEST", "1", null, null, createdAt);
    }

    private long tokenId(String suffix, Instant now) {
        return tokenRepository.save(ErpMobilePushToken.create(
                7L, "android", "device-" + suffix + "-" + now.toEpochMilli(),
                "token-" + suffix + "-" + now.toEpochMilli(), "1.0.0", now)).getId();
    }

    private ErpMobilePushOutbox terminalOutbox(long notificationId, long tokenId, Instant settledAt) {
        ErpMobilePushOutbox outbox = ErpMobilePushOutbox.create(notificationId, tokenId, settledAt);
        outbox.markDelivered(settledAt);
        return outbox;
    }
}
