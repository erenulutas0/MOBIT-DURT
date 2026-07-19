package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

/**
 * Scheduled retention for the append-only, high-write operational tables. The activity-event
 * audit log, the mobile-push outbox and the notification feed all grow without bound otherwise:
 * the outbox never deletes a row once it reaches a terminal state, and activity events and
 * notifications are only ever inserted. A daily job prunes rows past a configurable retention
 * window so table and index size stay bounded, and retires unread notifications past their window
 * so a badge can never stay lit forever. Each table is handled in its own transaction so one
 * failure can't block the others.
 */
@Service
@Profile("postgres")
public class RetentionService {

    private static final Logger log = LoggerFactory.getLogger(RetentionService.class);

    private final ErpActivityEventRepository activityEventRepository;
    private final ErpMobilePushOutboxRepository outboxRepository;
    private final ErpNotificationRepository notificationRepository;
    private final int activityEventRetentionDays;
    private final int pushOutboxRetentionDays;
    private final int notificationUnreadDays;
    private final int notificationHistoryDays;
    private final Clock clock;

    @Autowired
    public RetentionService(
            ErpActivityEventRepository activityEventRepository,
            ErpMobilePushOutboxRepository outboxRepository,
            ErpNotificationRepository notificationRepository,
            @Value("${docsbot.retention.activity-event-days:180}") int activityEventRetentionDays,
            @Value("${docsbot.retention.push-outbox-days:30}") int pushOutboxRetentionDays,
            @Value("${docsbot.retention.notification-unread-days:14}") int notificationUnreadDays,
            @Value("${docsbot.retention.notification-history-days:90}") int notificationHistoryDays
    ) {
        this(activityEventRepository, outboxRepository, notificationRepository,
                activityEventRetentionDays, pushOutboxRetentionDays,
                notificationUnreadDays, notificationHistoryDays, Clock.systemUTC());
    }

    RetentionService(
            ErpActivityEventRepository activityEventRepository,
            ErpMobilePushOutboxRepository outboxRepository,
            ErpNotificationRepository notificationRepository,
            int activityEventRetentionDays,
            int pushOutboxRetentionDays,
            int notificationUnreadDays,
            int notificationHistoryDays,
            Clock clock
    ) {
        this.activityEventRepository = activityEventRepository;
        this.outboxRepository = outboxRepository;
        this.notificationRepository = notificationRepository;
        this.activityEventRetentionDays = activityEventRetentionDays;
        this.pushOutboxRetentionDays = pushOutboxRetentionDays;
        this.notificationUnreadDays = notificationUnreadDays;
        this.notificationHistoryDays = notificationHistoryDays;
        this.clock = clock;
    }

    @Scheduled(cron = "${docsbot.retention.cron:0 30 3 * * *}",
            zone = "${docsbot.retention.zone:Europe/Istanbul}")
    public void purgeScheduled() {
        // Each step is isolated so one failure can't skip the rest — the previous version let the
        // first exception abort the whole nightly run.
        runStep("erp_activity_events", this::purgeActivityEvents);
        runStep("erp_mobile_push_outbox", this::purgePushOutbox);
        runStep("erp_notifications_retire", this::retireStaleNotifications);
        runStep("erp_notifications_purge", this::purgeNotificationHistory);
    }

    private void runStep(String name, java.util.function.IntSupplier step) {
        try {
            step.getAsInt();
        } catch (RuntimeException exception) {
            log.error("retention_step_failed step={}", name, exception);
        }
    }

    /**
     * Retires stale unread SYSTEM alerts. This is the backstop that makes a stuck badge impossible:
     * the per-task supersede only fires when a NEWER same-task alert arrives, so a row with no
     * future sibling (finished task, final escalation stage reached) would otherwise stay unread
     * forever. Scoped to {@link NotificationService#EXPIRING_ALERT_TYPES} so human-sent items —
     * messages, assignments, feedback — are never auto-read out from under someone returning from
     * leave. A window <= 0 disables it.
     */
    @Transactional
    public int retireStaleNotifications() {
        if (notificationUnreadDays <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        int retired = notificationRepository.markStaleUnreadRead(
                now.minus(Duration.ofDays(notificationUnreadDays)),
                NotificationService.EXPIRING_ALERT_TYPES,
                now);
        if (retired > 0) {
            log.info("retention_retire table=erp_notifications marked_read={} older_than_days={}",
                    retired, notificationUnreadDays);
        }
        return retired;
    }

    /** Delete long-settled READ notifications so the table stays bounded; unread are never deleted. */
    @Transactional
    public int purgeNotificationHistory() {
        if (notificationHistoryDays <= 0) {
            return 0;
        }
        Instant cutoff = clock.instant().minus(Duration.ofDays(notificationHistoryDays));
        int deleted = notificationRepository.deleteReadCreatedBefore(cutoff);
        if (deleted > 0) {
            log.info("retention_purge table=erp_notifications deleted={} older_than_days={}",
                    deleted, notificationHistoryDays);
        }
        return deleted;
    }

    /** Delete audit events older than the retention window. A window <= 0 disables the purge. */
    @Transactional
    public int purgeActivityEvents() {
        if (activityEventRetentionDays <= 0) {
            return 0;
        }
        Instant cutoff = clock.instant().minus(Duration.ofDays(activityEventRetentionDays));
        int deleted = activityEventRepository.deleteCreatedBefore(cutoff);
        if (deleted > 0) {
            log.info("retention_purge table=erp_activity_events deleted={} older_than_days={}",
                    deleted, activityEventRetentionDays);
        }
        return deleted;
    }

    /** Delete settled (delivered/dead) outbox rows older than the retention window; pending/retry stay. */
    @Transactional
    public int purgePushOutbox() {
        if (pushOutboxRetentionDays <= 0) {
            return 0;
        }
        Instant cutoff = clock.instant().minus(Duration.ofDays(pushOutboxRetentionDays));
        int deleted = outboxRepository.deleteTerminalUpdatedBefore(
                List.of(ErpMobilePushOutbox.STATUS_DELIVERED, ErpMobilePushOutbox.STATUS_DEAD),
                cutoff);
        if (deleted > 0) {
            log.info("retention_purge table=erp_mobile_push_outbox deleted={} older_than_days={}",
                    deleted, pushOutboxRetentionDays);
        }
        return deleted;
    }
}
