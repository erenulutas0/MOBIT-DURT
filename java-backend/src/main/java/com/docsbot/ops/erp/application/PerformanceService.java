package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;

/**
 * Admin-only accountability scoring. For each user and period (week/month) it counts tasks
 * completed on time, completed late, and past-deadline-but-still-open, then derives a transparent
 * score: 100 * (onTime + 0.5*late) / (onTime + late + overdueOpen). Weekly and monthly summaries
 * are pushed to the admin as notifications so review happens without anyone remembering to look.
 */
@Service
@Profile("postgres")
public class PerformanceService {

    public record UserPerformance(
            long userId,
            String name,
            int onTime,
            int late,
            int overdueOpen,
            int openActive,
            Integer score
    ) {
    }

    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpUserRepository userRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Autowired
    public PerformanceService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService
    ) {
        this(taskRepository, assignmentRepository, userRepository, notificationService, Clock.systemUTC());
    }

    PerformanceService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpUserRepository userRepository,
            NotificationService notificationService,
            Clock clock
    ) {
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<UserPerformance> listPerformance(ErpPrincipal principal, String period) {
        ErpValidation.requireAdmin(principal);
        return compute(period);
    }

    private List<UserPerformance> compute(String period) {
        Instant now = clock.instant();
        Instant from = now.minus("month".equalsIgnoreCase(period) ? Duration.ofDays(30) : Duration.ofDays(7));

        Map<Long, List<Long>> assigneesByTask = new HashMap<>();
        for (ErpTaskAssignment assignment : assignmentRepository.findAllByOrderByIdAsc()) {
            if (assignment.getAssigneeUserId() != null) {
                assigneesByTask.computeIfAbsent(assignment.getTaskId(), key -> new ArrayList<>())
                        .add(assignment.getAssigneeUserId());
            }
        }

        record Tally(int[] onTime, int[] late, int[] overdueOpen, int[] openActive) {
            Tally() {
                this(new int[1], new int[1], new int[1], new int[1]);
            }
        }
        Map<Long, Tally> tallies = new HashMap<>();

        for (ErpTask task : taskRepository.findAllByOrderByCreatedAtDescIdDesc()) {
            List<Long> assignees = assigneesByTask.get(task.getId());
            if (assignees == null || assignees.isEmpty()) {
                continue;
            }
            boolean closedDone = task.getStatus() == TaskStatus.DONE && task.getCompletedAt() != null;
            boolean open = task.getStatus() != TaskStatus.DONE && task.getStatus() != TaskStatus.CANCELLED;
            for (Long userId : assignees) {
                Tally tally = tallies.computeIfAbsent(userId, key -> new Tally());
                if (closedDone && !task.getCompletedAt().isBefore(from)) {
                    boolean onTime = task.getDeadlineAt() == null
                            || !task.getCompletedAt().isAfter(task.getDeadlineAt());
                    if (onTime) {
                        tally.onTime()[0]++;
                    } else {
                        tally.late()[0]++;
                    }
                } else if (open && task.getDeadlineAt() != null && task.getDeadlineAt().isBefore(now)
                        && !task.getDeadlineAt().isBefore(from)) {
                    // Missed deadline and still not delivered — the accountability signal.
                    tally.overdueOpen()[0]++;
                } else if (open) {
                    tally.openActive()[0]++;
                }
            }
        }

        List<UserPerformance> rows = new ArrayList<>();
        for (ErpUser user : userRepository.findAllByOrderByNameAscIdAsc()) {
            Tally tally = tallies.get(user.getId());
            if (tally == null) {
                continue;
            }
            int onTime = tally.onTime()[0];
            int late = tally.late()[0];
            int overdueOpen = tally.overdueOpen()[0];
            int scored = onTime + late + overdueOpen;
            Integer score = scored == 0
                    ? null
                    : (int) Math.round(100.0 * (onTime + 0.5 * late) / scored);
            rows.add(new UserPerformance(
                    user.getId(), user.getName(), onTime, late, overdueOpen, tally.openActive()[0], score));
        }
        rows.sort(Comparator
                .comparing((UserPerformance row) -> row.score() == null ? -1 : row.score())
                .reversed()
                .thenComparing(UserPerformance::name));
        return rows;
    }

    @Scheduled(
            cron = "${docsbot.performance.weekly-cron:0 0 8 * * MON}",
            zone = "${docsbot.performance.zone:Europe/Istanbul}")
    @Transactional
    public void weeklyReport() {
        sendReport("week", "Haftalık");
    }

    @Scheduled(
            cron = "${docsbot.performance.monthly-cron:0 5 8 1 * *}",
            zone = "${docsbot.performance.zone:Europe/Istanbul}")
    @Transactional
    public void monthlyReport() {
        sendReport("month", "Aylık");
    }

    private void sendReport(String period, String label) {
        List<UserPerformance> rows = compute(period);
        if (rows.isEmpty()) {
            return;
        }
        StringBuilder body = new StringBuilder();
        int listed = 0;
        for (UserPerformance row : rows) {
            if (listed >= 8) {
                body.append("… ve ").append(rows.size() - listed).append(" kişi daha.\n");
                break;
            }
            body.append(row.name())
                    .append(": ")
                    .append(row.score() == null ? "puanlanacak iş yok" : row.score() + " puan")
                    .append(" (").append(row.onTime()).append(" zamanında, ")
                    .append(row.late()).append(" geç, ")
                    .append(row.overdueOpen()).append(" gecikmiş açık)")
                    .append("\n");
            listed++;
        }
        Instant now = clock.instant();
        notificationService.notifyAdmin(
                "performance_report",
                "📊 " + label + " Performans Raporu",
                body.toString().trim(),
                null,
                "NORMAL",
                "performance:" + period + ":" + now.toString().substring(0, 10),
                now);
    }
}
