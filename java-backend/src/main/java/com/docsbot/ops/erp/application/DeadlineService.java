package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
    private static final int ADMIN_DIGEST_MAX_LINES = 8;

    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final List<Duration> dueSoonThresholds;
    private final List<Duration> escalationThresholds;
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
            @Value("${docsbot.deadline-escalation-thresholds-hours:4,12,24,48,96}") String escalationHours,
            @Value("${docsbot.admin-weekly-digest-zone:Europe/Istanbul}") String digestZone
    ) {
        this(
                taskRepository,
                assignmentRepository,
                teamMemberRepository,
                notificationService,
                activityRecorder,
                parseThresholdHours(thresholdHours),
                parseThresholdHours(escalationHours),
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
            List<Duration> escalationThresholds,
            ZoneId digestZone,
            Clock clock
    ) {
        if (dueSoonThresholds.isEmpty()) {
            throw new IllegalArgumentException("At least one due-soon threshold is required");
        }
        this.escalationThresholds = escalationThresholds.stream()
                .sorted(Comparator.naturalOrder())
                .toList();
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

    public static List<Duration> parseThresholdHours(String value) {
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
        List<String> digestLines = new ArrayList<>();
        StringBuilder digestKeySource = new StringBuilder();
        Map<Long, List<PendingAlert>> perAssignee = new LinkedHashMap<>();
        int changed = 0;
        for (ErpTask task : candidates) {
            if (!task.markOverdue(now)) {
                continue;
            }
            changed++;
            buffer(perAssignee, assignees.getOrDefault(task.getId(), Set.of()), new PendingAlert(
                    task.getId(),
                    task.getTitle(),
                    "termin aşıldı",
                    "CRITICAL",
                    "task_overdue:" + task.getId()));
            // Admin side is collected into one digest below — see processDueSoonTasks.
            digestLines.add("• " + task.getTitle());
            digestKeySource.append(task.getId()).append(';');
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
        flushAssigneeAlerts(
                perAssignee,
                "task_overdue",
                "Görev termini aşıldı",
                "task_overdue_digest",
                "Termini aşan görevleriniz",
                "task_overdue_digest:",
                now);
        notifyAdminDigest(
                "manager_overdue_digest",
                "Termini aşılan görevler",
                digestLines,
                "HIGH",
                "manager_overdue:" + digestKeyHash(digestKeySource.toString()),
                now);
        return changed;
    }

    /**
     * The "Dürt" escalation ladder: a task that STAYS overdue gets renewed nudges at each crossed
     * threshold (default 4h, 12h, 24h, 48h, 96h after the deadline) — assignees get a CRITICAL
     * re-nudge and the admin gets an "ownerless work" alert. Event keys make each stage fire once.
     */
    @Scheduled(
            fixedDelayString = "${docsbot.deadline-escalation-scan-ms:300000}",
            initialDelayString = "${docsbot.deadline-escalation-initial-delay-ms:20000}")
    @Transactional
    public int processOverdueEscalations() {
        Instant now = clock.instant();
        List<ErpTask> overdueTasks = taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.OVERDUE);
        Map<Long, Set<Long>> assignees = assignedUserIdsByTask(overdueTasks);
        // Assignees still get a per-task CRITICAL nudge (targeted, that's the point), but the
        // ADMIN gets ONE combined digest — nine stale test tasks used to mean nine separate
        // "Sahipsiz iş" notifications per stage, which read as a notification flood. The digest
        // lists EVERY task past an escalation stage (assignees or not — a truly ownerless overdue
        // task is exactly what this alert exists for) and its event key hashes the full
        // (task, stage) set, so it re-fires only when that set actually changes.
        List<String> digestLines = new ArrayList<>();
        StringBuilder digestKeySource = new StringBuilder();
        Map<Long, List<PendingAlert>> perAssignee = new LinkedHashMap<>();
        for (ErpTask task : overdueTasks) {
            if (task.getDeadlineAt() == null) {
                continue;
            }
            Duration overdueFor = Duration.between(task.getDeadlineAt(), now);
            Duration stage = largestCrossedEscalation(overdueFor);
            if (stage == null) {
                continue;
            }
            long stageHours = stage.toHours();
            buffer(perAssignee, assignees.getOrDefault(task.getId(), Set.of()), new PendingAlert(
                    task.getId(),
                    task.getTitle(),
                    stageHours + " saattir gecikmiş",
                    "CRITICAL",
                    "task_overdue_nudge:" + task.getId() + ":" + stageHours + "h"));
            digestLines.add("• " + task.getTitle() + " (" + stageHours + " saattir gecikmiş)");
            digestKeySource.append(task.getId()).append(':').append(stageHours).append(';');
        }
        int nudgedTasks = flushAssigneeAlerts(
                perAssignee,
                "task_overdue_nudge",
                "Görev hâlâ teslim edilmedi",
                "task_overdue_nudge_digest",
                "Hâlâ teslim edilmeyen görevleriniz",
                "task_overdue_nudge_digest:",
                now);
        if (!digestLines.isEmpty()) {
            notificationService.notifyAdmin(
                    "manager_overdue_escalation",
                    "⚠️ Sahipsiz işler (" + digestLines.size() + ")",
                    String.join("\n", digestLines),
                    null,
                    "HIGH",
                    "manager_overdue_escalation:" + digestKeyHash(digestKeySource.toString()),
                    now);
        }
        return nudgedTasks;
    }

    /** Collision-resistant short key for the digest set (32-bit hashCode collides too easily). */
    private static String digestKeyHash(String source) {
        try {
            byte[] hashed = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                hex.append(String.format("%02x", hashed[i]));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException exception) {
            return Integer.toHexString(source.hashCode());
        }
    }

    private Duration largestCrossedEscalation(Duration overdueFor) {
        Duration crossed = null;
        for (Duration threshold : escalationThresholds) {
            if (overdueFor.compareTo(threshold) >= 0) {
                crossed = threshold;
            }
        }
        return crossed;
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
        List<String> digestLines = new ArrayList<>();
        StringBuilder digestKeySource = new StringBuilder();
        Map<Long, List<PendingAlert>> perAssignee = new LinkedHashMap<>();
        for (ErpTask task : candidates) {
            Duration remaining = Duration.between(now, task.getDeadlineAt());
            Duration threshold = nearestCrossedThreshold(remaining);
            if (threshold == null) {
                continue;
            }
            long thresholdHours = threshold.toHours();
            String urgency = urgencyFor(threshold);
            buffer(perAssignee, assignees.getOrDefault(task.getId(), Set.of()), new PendingAlert(
                    task.getId(),
                    task.getTitle(),
                    humanizeHours(thresholdHours) + " kaldı",
                    urgency,
                    "task_due_soon:" + task.getId() + ":" + thresholdHours + "h"));
            // The admin sees EVERY task in the company, so a per-task alert here meant one buzz per
            // task per threshold — a dozen tasks crossing 72h together filled the phone in one scan.
            // Collected into a single digest below instead.
            digestLines.add("• " + task.getTitle() + " (" + humanizeHours(thresholdHours) + " kaldı)");
            digestKeySource.append(task.getId()).append(':').append(thresholdHours).append(';');
        }
        int changed = flushAssigneeAlerts(
                perAssignee,
                "task_due_soon",
                "Görev termini yaklaşıyor",
                "task_due_soon_digest",
                "Yaklaşan terminleriniz",
                "task_due_soon_digest:",
                now);
        notifyAdminDigest(
                "manager_due_soon_digest",
                "Yaklaşan terminler",
                digestLines,
                "NORMAL",
                "manager_due_soon:" + digestKeyHash(digestKeySource.toString()),
                now);
        return changed;
    }

    /** One task's alert, held until the scan knows how many that person is getting. */
    private record PendingAlert(long taskId, String title, String detail, String urgency, String eventKey) {
    }

    private static void buffer(
            Map<Long, List<PendingAlert>> perAssignee,
            Set<Long> userIds,
            PendingAlert alert
    ) {
        for (Long userId : userIds) {
            perAssignee.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(alert);
        }
    }

    /**
     * Sends each person either their one named alert or a single combined one. Naming the task is
     * what makes an assignee alert useful, so a lone alert keeps that — but somebody with eight
     * tasks crossing a threshold in the same scan used to get eight separate CRITICAL, heads-up,
     * vibrating notifications, which is what "sanki sürekli mesaj geliyormuş gibi" describes.
     */
    private int flushAssigneeAlerts(
            Map<Long, List<PendingAlert>> perAssignee,
            String singleType,
            String singleTitle,
            String digestType,
            String digestTitle,
            String digestKeyPrefix,
            Instant now
    ) {
        int created = 0;
        for (Map.Entry<Long, List<PendingAlert>> entry : perAssignee.entrySet()) {
            Set<Long> recipient = Set.of(entry.getKey());
            List<PendingAlert> alerts = entry.getValue();
            if (alerts.size() == 1) {
                PendingAlert only = alerts.get(0);
                created += notificationService.notifyUsers(
                        recipient, singleType, singleTitle, only.title(), only.taskId(),
                        only.urgency(), only.eventKey(), now);
                continue;
            }
            List<String> lines = alerts.stream()
                    .map(alert -> "• " + alert.title() + " (" + alert.detail() + ")")
                    .toList();
            List<String> shown = lines.size() > ADMIN_DIGEST_MAX_LINES
                    ? lines.subList(0, ADMIN_DIGEST_MAX_LINES)
                    : lines;
            StringBuilder keySource = new StringBuilder();
            alerts.forEach(alert -> keySource.append(alert.eventKey()).append(';'));
            created += notificationService.notifyUsers(
                    recipient,
                    digestType,
                    digestTitle + " (" + alerts.size() + ")",
                    String.join("\n", shown)
                            + (lines.size() > shown.size()
                                    ? "\n• ve " + (lines.size() - shown.size()) + " görev daha" : ""),
                    null,
                    // The most urgent member decides how loudly the combined alert lands.
                    alerts.stream().anyMatch(alert -> "CRITICAL".equals(alert.urgency())) ? "CRITICAL" : "HIGH",
                    digestKeyPrefix + digestKeyHash(keySource.toString()),
                    now);
        }
        return created;
    }

    /** "72 saat" reads worse than "3 gün" for the wider thresholds. */
    private static String humanizeHours(long hours) {
        return hours >= 24 && hours % 24 == 0 ? (hours / 24) + " gün" : hours + " saat";
    }

    /**
     * One combined admin alert per scan instead of one per task. The event key hashes the exact set
     * it covers, so an unchanged scan is a no-op and any genuinely new crossing produces a fresh
     * digest. Long lists are capped — the point is "look at the app", not to reproduce it.
     */
    private void notifyAdminDigest(
            String type,
            String titlePrefix,
            List<String> lines,
            String priority,
            String eventKey,
            Instant now
    ) {
        if (lines.isEmpty()) {
            return;
        }
        List<String> shown = lines.size() > ADMIN_DIGEST_MAX_LINES
                ? lines.subList(0, ADMIN_DIGEST_MAX_LINES)
                : lines;
        String body = String.join("\n", shown)
                + (lines.size() > shown.size() ? "\n• ve " + (lines.size() - shown.size()) + " görev daha" : "");
        notificationService.notifyAdmin(
                type,
                titlePrefix + " (" + lines.size() + ")",
                body,
                null,
                priority,
                eventKey,
                now);
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
        String body = "Önümüzdeki 7 gün içinde termini dolan " + due.size() + " görev: " + titles
                + (due.size() > WEEKLY_DIGEST_MAX_TITLES ? ", …" : "");
        return notificationService.notifyAdmin(
                "manager_weekly_digest",
                "Haftalık termin özeti",
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
