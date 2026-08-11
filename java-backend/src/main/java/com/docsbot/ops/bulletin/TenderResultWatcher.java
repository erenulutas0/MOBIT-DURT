package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.application.NotificationService;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;

/**
 * Tells the people who prepared a bid how it went.
 *
 * <p>This is the end of a loop the product otherwise leaves open. A tender appears in the morning
 * bulletin, somebody opens a preparation task for it, the deadline passes — and then nothing, for
 * weeks, until whoever remembers goes and looks it up on EKAP. The result bulletin has the answer
 * the whole time.
 *
 * <p>Only tenders with a task are announced. A company sees three hundred announcements a day and
 * bids on perhaps two; a notification for every result that scrolled past its screen would be the
 * bulletin again, and this project has already had one badge people learned to ignore.
 */
@Service
@Profile("postgres")
public class TenderResultWatcher {

    private static final Logger log = LoggerFactory.getLogger(TenderResultWatcher.class);

    static final String NOTIFICATION_TYPE = "tender_result";

    private final TenderNoticeRepository noticeRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public TenderResultWatcher(
            TenderNoticeRepository noticeRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            NotificationService notificationService
    ) {
        this(noticeRepository, assignmentRepository, notificationService, Clock.systemUTC());
    }

    TenderResultWatcher(
            TenderNoticeRepository noticeRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            NotificationService notificationService,
            Clock clock
    ) {
        this.noticeRepository = noticeRepository;
        this.assignmentRepository = assignmentRepository;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    /**
     * Announces one awarded contract, if the company was working on that tender.
     *
     * @return how many notifications were created
     */
    @Transactional
    public int announce(TenderResult result) {
        List<Long> taskIds = noticeRepository.findTaskIdsByIkn(result.getIkn());
        if (taskIds.isEmpty()) {
            return 0;
        }
        Instant now = clock.instant();
        int sent = 0;
        for (Long taskId : taskIds) {
            Set<Long> recipients = new LinkedHashSet<>();
            for (ErpTaskAssignment assignment : assignmentRepository
                    .findAllByTaskIdInOrderByIdAsc(List.of(taskId))) {
                if (assignment.getAssigneeUserId() != null) {
                    recipients.add(assignment.getAssigneeUserId());
                }
            }
            sent += notificationService.notifyUsers(
                    recipients,
                    NOTIFICATION_TYPE,
                    "Takip ettiğiniz ihale sonuçlandı",
                    body(result),
                    // Carried so tapping the notification opens the preparation task itself, which
                    // is where the bid's own paperwork and notes already are.
                    taskId,
                    "NORMAL",
                    // Once per tender per task, whatever happens afterwards. A bulletin re-run and
                    // a second lot of the same tender must not each announce it again.
                    NOTIFICATION_TYPE + ":" + result.getIkn() + ":task:" + taskId,
                    now);
            // The boss reads outcomes even when somebody else did the work, and a bid nobody was
            // assigned to would otherwise be announced to no one at all.
            sent += notificationService.notifyAdmin(
                    NOTIFICATION_TYPE,
                    "Takip ettiğiniz ihale sonuçlandı",
                    body(result),
                    taskId,
                    "NORMAL",
                    NOTIFICATION_TYPE + ":" + result.getIkn() + ":task:" + taskId + ":admin",
                    now);
        }
        log.info("tender_result_announced ikn={} tasks={} notified={}",
                result.getIkn(), taskIds.size(), sent);
        return sent;
    }

    /**
     * The line somebody reads on a lock screen: who took it, for how much, and how far under.
     *
     * <p>The discount is left out when the server would not compute it — a lot award, a missing
     * figure — rather than replaced with a dash. On a one-line notification a dash reads as a
     * defect, and the two figures beside each other already say the useful part.
     */
    private static String body(TenderResult result) {
        StringBuilder line = new StringBuilder();
        line.append(result.getIkn());
        if (result.getTitle() != null && !result.getTitle().isBlank()) {
            line.append(" — ").append(shorten(result.getTitle()));
        }
        line.append("\n");
        if (result.getWinner() != null && !result.getWinner().isBlank()) {
            line.append(shorten(result.getWinner()));
        } else {
            line.append("Yüklenici belirtilmemiş");
        }
        if (result.getContractAmount() != null) {
            line.append(" · ").append(money(result.getContractAmount(), result.getContractCurrency()));
        }
        BigDecimal discount = result.discountPercent();
        if (discount != null) {
            line.append(" · %").append(discount.toPlainString()).append(" kırım");
        } else if (result.isPartialAward()) {
            line.append(" · kısımlara bölünmüş ihale");
        }
        return line.toString();
    }

    /** Turkish grouping and no kuruş — a lock screen has no room for the change. */
    private static String money(BigDecimal amount, String currency) {
        return String.format(java.util.Locale.of("tr", "TR"), "%,.0f %s",
                amount, currency == null ? "TRY" : currency);
    }

    private static String shorten(String value) {
        String trimmed = value.trim();
        return trimmed.length() <= 70 ? trimmed : trimmed.substring(0, 69) + "…";
    }
}
