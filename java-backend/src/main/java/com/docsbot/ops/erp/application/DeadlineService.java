package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.WeekFields;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

@Service
@Profile("postgres")
public class DeadlineService {

    private static final Set<TaskStatus> OVERDUE_CANDIDATE_STATUSES =
            Set.of(TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED);
    private static final Duration WEEKLY_DIGEST_WINDOW = Duration.ofDays(7);
    private static final int WEEKLY_DIGEST_MAX_TITLES = 5;

    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final List<Duration> dueSoonThresholds;
    private final ZoneId digestZone;
    private final Clock clock;

    @Autowired
    public DeadlineService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            @Value("${docsbot.deadline-due-soon-thresholds-hours:72,48,24,12,6,1}") String thresholdHours,
            @Value("${docsbot.admin-weekly-digest-zone:Europe/Istanbul}") String digestZone
    ) {
        this(
                taskRepository,
                assignmentRepository,
                teamMemberRepository,
                notificationService,
                activityRecorder,
                parseThresholdHours(thresholdHours),
                ZoneId.of(digestZone),
                Clock.systemUTC());
    }

    DeadlineService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            List<Duration> dueSoonThresholds,
            ZoneId digestZone,
            Clock clock
    ) {
        if (dueSoonThresholds.isEmpty()) {
            throw new IllegalArgumentException("At least one due-soon threshold is required");
        }
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.dueSoonThresholds = dueSoonThresholds.stream()
                .sorted(Comparator.naturalOrder())
                .toList();
        this.digestZone = digestZone;
        this.clock = clock;
    }

    static List<Duration> parseThresholdHours(String value) {
        return java.util.Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .map(part -> Duration.ofHours(Long.parseLong(part)))
                .toList();
    }

    @Scheduled(
            fixedDelayString = "${docsbot.deadline-scan-ms:60000}",
            initialDelayString = "${docsbot.deadline-initial-delay-ms:10000}")
    @Transactional
    public int processOverdueTasks() {
        Instant now = clock.instant();
        List<ErpTask> candidates = taskRepository.findAllByDeadlineAtBeforeAndStatusIn(
                now,
                OVERDUE_CANDIDATE_STATUSES);
        Map<Long, Set<Long>> assignees = assignedUserIdsByTask(candidates);
        int changed = 0;
        for (ErpTask task : candidates) {
            if (!task.markOverdue(now)) {
                continue;
            }
            changed++;
            notificationService.notifyUsers(
                    assignees.getOrDefault(task.getId(), Set.of()),
                    "task_overdue",
                    "Task deadline exceeded",
                    task.getTitle(),
                    task.getId(),
                    "CRITICAL",
                    "task_overdue:" + task.getId(),
                    now);
            notificationService.notifyAdmin(
                    "manager_overdue_digest",
                    "Task deadline exceeded",
                    task.getTitle(),
                    task.getId(),
                    "HIGH",
                    "manager_overdue:" + task.getId(),
                    now);
            activityRecorder.recordActor(
                    "system",
                    null,
                    "workflow-sla",
                    "TASK_OVERDUE_ESCALATED",
                    "TASK",
                    task.getId().toString(),
                    task.getId(),
                    "deadline_at=" + task.getDeadlineAt());
        }
        return changed;
    }

    @Scheduled(
            fixedDelayString = "${docsbot.deadline-due-soon-scan-ms:60000}",
            initialDelayString = "${docsbot.deadline-due-soon-initial-delay-ms:15000}")
    @Transactional
    public int processDueSoonTasks() {
        Instant now = clock.instant();
        Duration widestThreshold = dueSoonThresholds.get(dueSoonThresholds.size() - 1);
        List<ErpTask> candidates = taskRepository.findAllByDeadlineAtBetweenAndStatusIn(
                now,
                now.plus(widestThreshold),
                OVERDUE_CANDIDATE_STATUSES);
        Map<Long, Set<Long>> assignees = assignedUserIdsByTask(candidates);
        int changed = 0;
        for (ErpTask task : candidates) {
            Duration remaining = Duration.between(now, task.getDeadlineAt());
            Duration threshold = nearestCrossedThreshold(remaining);
            if (threshold == null) {
                continue;
            }
            long thresholdHours = threshold.toHours();
            String urgency = urgencyFor(threshold);
            int created = notificationService.notifyUsers(
                    assignees.getOrDefault(task.getId(), Set.of()),
                    "task_due_soon",
                    "Task deadline is approaching",
                    task.getTitle(),
                    task.getId(),
                    urgency,
                    "task_due_soon:" + task.getId() + ":" + thresholdHours + "h",
                    now);
            created += notificationService.notifyAdmin(
                    "manager_due_soon_digest",
                    "Task deadline is approaching",
                    task.getTitle(),
                    task.getId(),
                    "NORMAL",
                    "manager_due_soon:" + task.getId() + ":" + thresholdHours + "h",
                    now);
            if (created > 0) {
                changed++;
            }
        }
        return changed;
    }

    @Scheduled(cron = "${docsbot.admin-weekly-digest-cron:0 0 7 * * MON}",
            zone = "${docsbot.admin-weekly-digest-zone:Europe/Istanbul}")
    @Transactional
    public int processWeeklyAdminDigest() {
        Instant now = clock.instant();
        List<ErpTask> due = taskRepository.findAllByDeadlineAtBetweenAndStatusIn(
                now,
                now.plus(WEEKLY_DIGEST_WINDOW),
                OVERDUE_CANDIDATE_STATUSES);
        if (due.isEmpty()) {
            return 0;
        }
        LocalDate today = LocalDate.ofInstant(now, digestZone);
        int week = today.get(WeekFields.ISO.weekOfWeekBasedYear());
        int weekYear = today.get(WeekFields.ISO.weekBasedYear());
        String titles = due.stream()
                .sorted(Comparator.comparing(ErpTask::getDeadlineAt))
                .limit(WEEKLY_DIGEST_MAX_TITLES)
                .map(ErpTask::getTitle)
                .collect(Collectors.joining(", "));
        String body = due.size() + " task(s) are due within the next 7 days: " + titles
                + (due.size() > WEEKLY_DIGEST_MAX_TITLES ? ", …" : "");
        return notificationService.notifyAdmin(
                "manager_weekly_digest",
                "Weekly deadline digest",
                body,
                null,
                "NORMAL",
                "admin_week_digest:" + weekYear + "-W" + week,
                now);
    }

    private Duration nearestCrossedThreshold(Duration remaining) {
        for (Duration threshold : dueSoonThresholds) {
            if (threshold.compareTo(remaining) >= 0) {
                return threshold;
            }
        }
        return null;
    }

    private String urgencyFor(Duration threshold) {
        if (threshold.compareTo(Duration.ofHours(48)) >= 0) {
            return "NORMAL";
        }
        if (threshold.compareTo(Duration.ofHours(12)) >= 0) {
            return "HIGH";
        }
        return "CRITICAL";
    }

    private Map<Long, Set<Long>> assignedUserIdsByTask(List<ErpTask> tasks) {
        return TaskAssigneeBatch.assignedUserIdsByTask(
                assignmentRepository,
                teamMemberRepository,
                tasks.stream().map(ErpTask::getId).toList());
    }
}
