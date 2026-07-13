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

/**
 * Scheduled retention for the append-only, high-write operational tables. The activity-event
 * audit log and the mobile-push outbox both grow without bound otherwise: the outbox never
 * deletes a row once it reaches a terminal state, and activity events are only ever inserted.
 * A daily job prunes rows past a configurable retention window so table and index size stay
 * bounded. Each table is pruned in its own transaction so one failure can't block the others.
 */
@Service
@Profile("postgres")
public class RetentionService {

    private static final Logger log = LoggerFactory.getLogger(RetentionService.class);

    private final ErpActivityEventRepository activityEventRepository;
    private final ErpMobilePushOutboxRepository outboxRepository;
    private final int activityEventRetentionDays;
    private final int pushOutboxRetentionDays;
    private final Clock clock;

    @Autowired
    public RetentionService(
            ErpActivityEventRepository activityEventRepository,
            ErpMobilePushOutboxRepository outboxRepository,
            @Value("${docsbot.retention.activity-event-days:180}") int activityEventRetentionDays,
            @Value("${docsbot.retention.push-outbox-days:30}") int pushOutboxRetentionDays
    ) {
        this(activityEventRepository, outboxRepository, activityEventRetentionDays,
                pushOutboxRetentionDays, Clock.systemUTC());
    }

    RetentionService(
            ErpActivityEventRepository activityEventRepository,
            ErpMobilePushOutboxRepository outboxRepository,
            int activityEventRetentionDays,
            int pushOutboxRetentionDays,
            Clock clock
    ) {
        this.activityEventRepository = activityEventRepository;
        this.outboxRepository = outboxRepository;
        this.activityEventRetentionDays = activityEventRetentionDays;
        this.pushOutboxRetentionDays = pushOutboxRetentionDays;
        this.clock = clock;
    }

    @Scheduled(cron = "${docsbot.retention.cron:0 30 3 * * *}",
            zone = "${docsbot.retention.zone:Europe/Istanbul}")
    public void purgeScheduled() {
        purgeActivityEvents();
        purgePushOutbox();
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
