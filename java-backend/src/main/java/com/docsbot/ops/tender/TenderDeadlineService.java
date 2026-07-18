package com.docsbot.ops.tender;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.NotificationService;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.infrastructure.TenderRepository;

/**
 * İhale takvimi: alerts the admin as a tender's submission deadline (son teklif tarihi)
 * approaches — default 168h/72h/24h/4h before — and once more when it passes. Event keys make
 * each stage fire exactly once per tender.
 */
@Service
@Profile("postgres")
public class TenderDeadlineService {

    private final TenderRepository tenderRepository;
    private final NotificationService notificationService;
    private final List<Duration> thresholds;
    private final Clock clock;

    @Autowired
    public TenderDeadlineService(
            TenderRepository tenderRepository,
            NotificationService notificationService,
            @Value("${docsbot.tender-deadline-thresholds-hours:168,72,24,4}") String thresholdHours
    ) {
        this(tenderRepository, notificationService,
                com.docsbot.ops.erp.application.DeadlineService.parseThresholdHours(thresholdHours),
                Clock.systemUTC());
    }

    TenderDeadlineService(
            TenderRepository tenderRepository,
            NotificationService notificationService,
            List<Duration> thresholds,
            Clock clock
    ) {
        this.tenderRepository = tenderRepository;
        this.notificationService = notificationService;
        this.thresholds = thresholds.stream().sorted().toList();
        this.clock = clock;
    }

    @Scheduled(
            fixedDelayString = "${docsbot.tender-deadline-scan-ms:600000}",
            initialDelayString = "${docsbot.tender-deadline-initial-delay-ms:30000}")
    @Transactional
    public int processTenderDeadlines() {
        Instant now = clock.instant();
        int created = 0;
        for (Tender tender : tenderRepository.findAll()) {
            Instant deadline = tender.getSubmissionDeadlineAt();
            if (deadline == null) {
                continue;
            }
            String label = tender.getOrganization() + " (" + tender.getTenderId() + ")";
            if (deadline.isBefore(now)) {
                created += notificationService.notifyAdmin(
                        "tender_deadline_passed",
                        "🔴 İhale teslim süresi geçti: " + tender.getOrganization(),
                        label + " için son teklif tarihi geçti.",
                        null,
                        "CRITICAL",
                        "tender_deadline_passed:" + tender.getId(),
                        now);
                continue;
            }
            Duration remaining = Duration.between(now, deadline);
            Duration crossed = null;
            for (Duration threshold : thresholds) {
                if (threshold.compareTo(remaining) >= 0) {
                    crossed = threshold;
                    break;
                }
            }
            if (crossed == null) {
                continue;
            }
            long hours = crossed.toHours();
            String remainingLabel = hours >= 24 ? (hours / 24) + " gün" : hours + " saat";
            created += notificationService.notifyAdmin(
                    "tender_deadline_soon",
                    "📌 İhale teslimi yaklaşıyor: " + tender.getOrganization(),
                    label + " son teklif tarihine yaklaşık " + remainingLabel + " kaldı.",
                    null,
                    hours <= 24 ? "HIGH" : "NORMAL",
                    "tender_deadline_soon:" + tender.getId() + ":" + hours + "h",
                    now);
        }
        return created;
    }
}
