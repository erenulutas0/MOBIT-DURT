package com.docsbot.ops.bulletin;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.ErpService;
import com.docsbot.ops.erp.domain.ErpTask;

/**
 * Turns an announcement into something somebody is actually going to do.
 *
 * <p>Reading the bulletin is only half of it. A tender closes at 11:30 on a Tuesday and the work —
 * gathering the yeterlik belgeleri, pricing it, getting the teminat mektubu — takes days that have
 * to start on somebody's board, not in somebody's memory. The task carries the deadline, so the
 * escalation ladder that already exists starts counting down to the tender hour on its own.
 */
@Service
@Profile("postgres")
public class BulletinTaskService {

    private static final Logger log = LoggerFactory.getLogger(BulletinTaskService.class);

    /** Long enough to say which tender it is, short enough to read on a task card. */
    private static final int TITLE_LIMIT = 70;

    private final TenderNoticeRepository noticeRepository;
    private final ErpService erpService;

    public BulletinTaskService(TenderNoticeRepository noticeRepository, ErpService erpService) {
        this.noticeRepository = noticeRepository;
        this.erpService = erpService;
    }

    /**
     * Opens the preparation task for one announcement.
     *
     * @param assigneeUserIds who does it; empty means the board decides later
     * @throws IllegalStateException when a task already exists, so a second click on a slow
     *                               connection cannot open the same job twice
     */
    @Transactional
    public ErpTask openTask(ErpPrincipal principal, long noticeId, List<Long> assigneeUserIds,
                            String priority) {
        TenderNotice notice = noticeRepository.findById(noticeId)
                .orElseThrow(() -> new IllegalArgumentException("İlan bulunamadı"));
        if (notice.getTaskId() != null) {
            throw new IllegalStateException("Bu ilan için zaten görev açılmış: #" + notice.getTaskId());
        }

        ErpTask task = erpService.createTask(
                principal,
                title(notice),
                description(notice),
                assigneeUserIds == null ? List.of() : assigneeUserIds,
                List.of(),
                null,
                java.util.Map.of(),
                priority == null || priority.isBlank() ? "HIGH" : priority,
                // The tender hour itself. Teklifler close then, so the existing deadline ladder
                // counting down to it is counting down to the real thing — an earlier "internal"
                // deadline would be a number somebody invented, and the alerts would be about it.
                notice.getTenderAt(),
                null,
                null,
                null);
        notice.attachTask(task.getId());
        log.info("tender_task_opened notice={} ikn={} task={}", noticeId, notice.getIkn(), task.getId());
        return task;
    }

    private static String title(TenderNotice notice) {
        String work = notice.getTitle() == null || notice.getTitle().isBlank()
                ? notice.getIkn()
                : notice.getTitle().strip();
        if (work.length() > TITLE_LIMIT) {
            work = work.substring(0, TITLE_LIMIT - 1) + "…";
        }
        return "İhale hazırlığı: " + work;
    }

    /**
     * Everything needed to start without opening the bulletin again — and the İKN, which is what a
     * person types into EKAP when they do need the original.
     */
    private static String description(TenderNotice notice) {
        StringBuilder text = new StringBuilder();
        text.append("İKN: ").append(notice.getIkn()).append('\n');
        if (notice.getAuthority() != null && !notice.getAuthority().isBlank()) {
            text.append("İdare: ").append(notice.getAuthority()).append('\n');
        }
        if (notice.getProvince() != null) {
            text.append("İl: ").append(notice.getProvince()).append('\n');
        }
        if (notice.getTenderAtText() != null && !notice.getTenderAtText().isBlank()) {
            text.append("İhale tarihi: ").append(notice.getTenderAtText()).append('\n');
        }
        text.append("Tür: ").append(notice.getBulletinType())
                .append(" · ").append(notice.getCategoryLabel()).append('\n');
        if (notice.getQuantity() != null && !notice.getQuantity().isBlank()) {
            text.append("\nNiteliği ve miktarı:\n").append(notice.getQuantity()).append('\n');
        }
        if (notice.getTitle() != null && notice.getTitle().length() > TITLE_LIMIT) {
            // The card had to cut the name short; the whole of it belongs somewhere.
            text.append("\nİşin tam adı:\n").append(notice.getTitle()).append('\n');
        }
        return text.toString().strip();
    }
}
