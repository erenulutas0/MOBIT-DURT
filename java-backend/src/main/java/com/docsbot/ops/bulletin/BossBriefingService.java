package com.docsbot.ops.bulletin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.BossBriefing;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.domain.CompanyCredential;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.CompanyCredentialRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;

/**
 * The owner's own screen: what is waiting on them, and where the money stands.
 *
 * <p>Assembled from what the company already records rather than from anything new. The bids are
 * its own, the outcomes come from the public results, the tasks and papers are already tracked —
 * the work here is putting them in one place in the order an owner asks about them.
 */
@Service
@Profile("postgres")
public class BossBriefingService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    /** Same window the home screen warns on, so two screens never disagree about one date. */
    private static final int EXPIRY_WARNING_DAYS = 30;
    /** How many tenders in preparation are worth listing before the screen becomes a list. */
    private static final int UPCOMING_LIMIT = 6;

    private final BidMemoryService bidMemoryService;
    private final ErpTaskRepository taskRepository;
    private final CompanyCredentialRepository credentialRepository;
    private final TenderNoticeRepository noticeRepository;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public BossBriefingService(BidMemoryService bidMemoryService, ErpTaskRepository taskRepository,
                               CompanyCredentialRepository credentialRepository,
                               TenderNoticeRepository noticeRepository) {
        this(bidMemoryService, taskRepository, credentialRepository, noticeRepository,
                Clock.systemUTC());
    }

    BossBriefingService(BidMemoryService bidMemoryService, ErpTaskRepository taskRepository,
                        CompanyCredentialRepository credentialRepository,
                        TenderNoticeRepository noticeRepository, Clock clock) {
        this.bidMemoryService = bidMemoryService;
        this.taskRepository = taskRepository;
        this.credentialRepository = credentialRepository;
        this.noticeRepository = noticeRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public BossBriefing briefing() {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, BUSINESS_ZONE);

        int pendingApproval = taskRepository
                .findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.PENDING_APPROVAL).size();
        int overdue = taskRepository
                .findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.OVERDUE).size();
        // Open work whose deadline lands inside the next seven days — the week the owner is about
        // to have, as opposed to the one that already went wrong.
        int dueThisWeek = taskRepository.findAllByDeadlineAtBetweenAndStatusIn(
                now, now.plus(java.time.Duration.ofDays(7)),
                List.of(TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED)).size();

        int lapsed = 0;
        int expiring = 0;
        for (CompanyCredential credential : credentialRepository.findAll()) {
            LocalDate validUntil = credential.getValidUntil();
            if (validUntil == null) {
                continue;
            }
            if (validUntil.isBefore(today)) {
                lapsed++;
            } else if (validUntil.isBefore(today.plusDays(EXPIRY_WARNING_DAYS))) {
                expiring++;
            }
        }

        List<BossBriefing.Upcoming> upcoming = noticeRepository.findInPreparation(now).stream()
                .limit(UPCOMING_LIMIT)
                .map(BossBriefingService::upcoming)
                .toList();

        return BossBriefing.of(bidMemoryService.outcomes(), today, pendingApproval, overdue,
                dueThisWeek, lapsed, expiring, upcoming);
    }

    private static BossBriefing.Upcoming upcoming(TenderNotice notice) {
        return new BossBriefing.Upcoming(notice.getId(), notice.getIkn(), notice.getTitle(),
                notice.getAuthority(), notice.getTenderAtText(), notice.getTenderAt(),
                notice.getTaskId());
    }
}
