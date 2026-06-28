package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
            @Value("${docsbot.sla-approval-after-ms:14400000}") long approvalAfterMs
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
        this.clock = clock;
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
            if (!elapsed(reference.getCreatedAt(), now, blockedAfter)) {
                continue;
            }
            String eventKey = "sla_blocked:" + task.getId() + ":" + reference.getId();
            int created = notificationService.notifyAdmin(
                    "task_blocked_escalation",
                    "Task remains blocked",
                    task.getTitle(),
                    task.getId(),
                    "HIGH",
                    eventKey,
                    now);
            if (created > 0) {
                notifyAssignees(task, "task_blocked_escalation", now, eventKey);
                activityRecorder.recordActor(
                        "system",
                        null,
                        "workflow-sla",
                        "TASK_BLOCKED_ESCALATED",
                        "TASK",
                        task.getId().toString(),
                        task.getId(),
                        "blocked_since=" + reference.getCreatedAt());
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
            if (!elapsed(reference.getCreatedAt(), now, approvalAfter)) {
                continue;
            }
            String eventKey = "sla_approval:" + task.getId() + ":" + reference.getId();
            int created = notificationService.notifyAdmin(
                    "task_completion_approval_escalation",
                    "Task approval is waiting",
                    task.getTitle(),
                    task.getId(),
                    "HIGH",
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
                        "pending_since=" + reference.getCreatedAt());
                changed++;
            }
        }
        return changed;
    }

    private void notifyAssignees(ErpTask task, String type, Instant now, String eventKey) {
        notificationService.notifyUsers(
                assignedUserIds(task.getId()),
                type,
                "Task remains blocked",
                task.getTitle(),
                task.getId(),
                "HIGH",
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

    private boolean elapsed(Instant reference, Instant now, Duration threshold) {
        return !reference.plus(threshold).isAfter(now);
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
