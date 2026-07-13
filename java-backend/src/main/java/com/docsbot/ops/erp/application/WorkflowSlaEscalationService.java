package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

@Service
@Profile("postgres")
public class WorkflowSlaEscalationService {

    private final ErpTaskRepository taskRepository;
    private final ErpActivityEventRepository activityRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final Duration blockedAfter;
    private final Duration approvalAfter;
    /**
     * Repeat rungs measured from the reference activity, sorted ascending. Once a task stays
     * blocked / pending past a rung, the escalation re-fires with CRITICAL urgency. Only the
     * highest crossed rung fires, so long-stuck tasks do not storm at deploy or catch-up.
     */
    private final List<Duration> repeatRungs;
    private final Clock clock;

    @Autowired
    public WorkflowSlaEscalationService(
            ErpTaskRepository taskRepository,
            ErpActivityEventRepository activityRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            @Value("${docsbot.sla-blocked-after-ms:86400000}") long blockedAfterMs,
            @Value("${docsbot.sla-approval-after-ms:14400000}") long approvalAfterMs,
            @Value("${docsbot.sla-repeat-after-hours:24,48}") String repeatAfterHours
    ) {
        this(
                taskRepository,
                activityRepository,
                assignmentRepository,
                teamMemberRepository,
                notificationService,
                activityRecorder,
                Duration.ofMillis(Math.max(0, blockedAfterMs)),
                Duration.ofMillis(Math.max(0, approvalAfterMs)),
                parseRepeatHours(repeatAfterHours),
                Clock.systemUTC());
    }

    WorkflowSlaEscalationService(
            ErpTaskRepository taskRepository,
            ErpActivityEventRepository activityRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            Duration blockedAfter,
            Duration approvalAfter,
            List<Duration> repeatRungs,
            Clock clock
    ) {
        this.taskRepository = taskRepository;
        this.activityRepository = activityRepository;
        this.assignmentRepository = assignmentRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.blockedAfter = blockedAfter;
        this.approvalAfter = approvalAfter;
        this.repeatRungs = repeatRungs.stream().sorted(Comparator.naturalOrder()).toList();
        this.clock = clock;
    }

    static List<Duration> parseRepeatHours(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .map(part -> Duration.ofHours(Long.parseLong(part)))
                .toList();
    }

    @Scheduled(
            fixedDelayString = "${docsbot.sla-scan-ms:60000}",
            initialDelayString = "${docsbot.sla-initial-delay-ms:20000}")
    @Transactional
    public int processEscalations() {
        return processBlockedTasks() + processPendingApprovals();
    }

    private int processBlockedTasks() {
        Instant now = clock.instant();
        int changed = 0;
        for (ErpTask task : taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.BLOCKED)) {
            ErpActivityEvent reference = latestActivity(task, "TASK_STATUS_CHANGED");
            int rung = highestCrossedRung(reference.getCreatedAt(), now, blockedAfter);
            if (rung < 0) {
                continue;
            }
            // Rung 0 keeps the pre-ladder key format so already-sent escalations stay deduped.
            String eventKey = "sla_blocked:" + task.getId() + ":" + reference.getId()
                    + (rung == 0 ? "" : ":r" + rung);
            String urgency = rung == 0 ? "HIGH" : "CRITICAL";
            String title = rung == 0
                    ? "Görev hâlâ bloke"
                    : "Görev hâlâ bloke (yükseltme " + rung + ")";
            int created = notificationService.notifyAdmin(
                    "task_blocked_escalation",
                    title,
                    task.getTitle(),
                    task.getId(),
                    urgency,
                    eventKey,
                    now);
            if (created > 0) {
                notifyAssignees(task, "task_blocked_escalation", title, urgency, now, eventKey);
                activityRecorder.recordActor(
                        "system",
                        null,
                        "workflow-sla",
                        "TASK_BLOCKED_ESCALATED",
                        "TASK",
                        task.getId().toString(),
                        task.getId(),
                        "blocked_since=" + reference.getCreatedAt() + "; rung=" + rung);
                changed++;
            }
        }
        return changed;
    }

    private int processPendingApprovals() {
        Instant now = clock.instant();
        int changed = 0;
        for (ErpTask task : taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.PENDING_APPROVAL)) {
            ErpActivityEvent reference = latestActivity(task, "TASK_COMPLETION_REQUESTED");
            int rung = highestCrossedRung(reference.getCreatedAt(), now, approvalAfter);
            if (rung < 0) {
                continue;
            }
            String eventKey = "sla_approval:" + task.getId() + ":" + reference.getId()
                    + (rung == 0 ? "" : ":r" + rung);
            String urgency = rung == 0 ? "HIGH" : "CRITICAL";
            String title = rung == 0
                    ? "Tamamlanma onayı bekliyor"
                    : "Tamamlanma onayı hâlâ bekliyor (yükseltme " + rung + ")";
            int created = notificationService.notifyAdmin(
                    "task_completion_approval_escalation",
                    title,
                    task.getTitle(),
                    task.getId(),
                    urgency,
                    eventKey,
                    now);
            if (created > 0) {
                activityRecorder.recordActor(
                        "system",
                        null,
                        "workflow-sla",
                        "TASK_APPROVAL_ESCALATED",
                        "TASK",
                        task.getId().toString(),
                        task.getId(),
                        "pending_since=" + reference.getCreatedAt() + "; rung=" + rung);
                changed++;
            }
        }
        return changed;
    }

    /**
     * Returns the highest escalation rung the elapsed time has crossed: 0 for the base
     * threshold, 1..n for the configured repeat rungs, -1 when the base is not crossed yet.
     */
    private int highestCrossedRung(Instant reference, Instant now, Duration base) {
        if (reference.plus(base).isAfter(now)) {
            return -1;
        }
        Duration elapsed = Duration.between(reference, now);
        int rung = 0;
        for (int index = 0; index < repeatRungs.size(); index++) {
            if (elapsed.compareTo(repeatRungs.get(index)) >= 0) {
                rung = index + 1;
            }
        }
        return rung;
    }

    private void notifyAssignees(
            ErpTask task,
            String type,
            String title,
            String urgency,
            Instant now,
            String eventKey
    ) {
        notificationService.notifyUsers(
                assignedUserIds(task.getId()),
                type,
                title,
                task.getTitle(),
                task.getId(),
                urgency,
                eventKey,
                now);
    }

    private ErpActivityEvent latestActivity(ErpTask task, String eventType) {
        return activityRepository.findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc(
                        task.getId(),
                        eventType)
                .orElseGet(() -> ErpActivityEvent.create(
                        "system",
                        null,
                        "workflow-sla",
                        eventType,
                        "TASK",
                        task.getId().toString(),
                        task.getId(),
                        "fallback=task_created_at",
                        task.getCreatedAt()));
    }

    private Set<Long> assignedUserIds(long taskId) {
        Set<Long> userIds = new java.util.LinkedHashSet<>();
        Set<Long> teamIds = new java.util.LinkedHashSet<>();
        assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.of(taskId))
                .forEach(assignment -> {
                    if (assignment.getAssigneeUserId() != null) {
                        userIds.add(assignment.getAssigneeUserId());
                    }
                    if (assignment.getAssigneeTeamId() != null) {
                        teamIds.add(assignment.getAssigneeTeamId());
                    }
                });
        if (!teamIds.isEmpty()) {
            teamMemberRepository.findAllByTeamIdIn(teamIds)
                    .forEach(member -> userIds.add(member.getUserId()));
        }
        return userIds;
    }
}
