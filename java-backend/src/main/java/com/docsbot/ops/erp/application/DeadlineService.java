package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
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
    private static final Duration DUE_SOON_WINDOW = Duration.ofHours(24);

    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final Clock clock;

    @Autowired
    public DeadlineService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder
    ) {
        this(
                taskRepository,
                assignmentRepository,
                teamMemberRepository,
                notificationService,
                activityRecorder,
                Clock.systemUTC());
    }

    DeadlineService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            Clock clock
    ) {
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.clock = clock;
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
        int changed = 0;
        for (ErpTask task : candidates) {
            if (!task.markOverdue(now)) {
                continue;
            }
            changed++;
            notificationService.notifyUsers(
                    assignedUserIds(task.getId()),
                    "task_overdue",
                    "Task deadline exceeded",
                    task.getTitle(),
                    task.getId(),
                    "HIGH",
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
        Instant dueSoonEndsAt = now.plus(DUE_SOON_WINDOW);
        List<ErpTask> candidates = taskRepository.findAllByDeadlineAtBetweenAndStatusIn(
                now,
                dueSoonEndsAt,
                OVERDUE_CANDIDATE_STATUSES);
        int changed = 0;
        for (ErpTask task : candidates) {
            int created = notificationService.notifyUsers(
                    assignedUserIds(task.getId()),
                    "task_due_soon",
                    "Task deadline is approaching",
                    task.getTitle(),
                    task.getId(),
                    "HIGH",
                    "task_due_soon:" + task.getId(),
                    now);
            created += notificationService.notifyAdmin(
                    "manager_due_soon_digest",
                    "Task deadline is approaching",
                    task.getTitle(),
                    task.getId(),
                    "NORMAL",
                    "manager_due_soon:" + task.getId(),
                    now);
            if (created > 0) {
                changed++;
            }
        }
        return changed;
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
