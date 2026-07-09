package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.common.page.OffsetLimitPageable;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.ErpTaskComment;
import com.docsbot.ops.erp.domain.ErpWorkflowTemplate;
import com.docsbot.ops.erp.domain.ErpWorkflowTemplateAssignment;
import com.docsbot.ops.erp.domain.TaskPriority;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskCommentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

@Service
@Profile("postgres")
class ErpTaskWorkflowService {
    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTaskCommentRepository commentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final ErpTaskAccessService accessService;
    private final Clock clock;

    ErpTaskWorkflowService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTaskCommentRepository commentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            ErpTaskAccessService accessService
    ) {
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
        this.commentRepository = commentRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.accessService = accessService;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    List<ErpTask> listTasks(ErpPrincipal principal) {
        return accessService.visibleTasks(principal);
    }

    @Transactional(readOnly = true)
    ErpService.PageResult<ErpTask> pageTasks(ErpPrincipal principal, int offset, int limit) {
        if (principal.admin()) {
            var page = taskRepository.findAll(new OffsetLimitPageable(
                    limit,
                    offset,
                    Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))));
            return new ErpService.PageResult<>(page.getTotalElements(), page.getContent());
        }
        List<ErpTask> tasks = accessService.visibleTasks(principal);
        return new ErpService.PageResult<>(tasks.size(), slice(tasks, offset, limit));
    }

    @Transactional(readOnly = true)
    ErpTask getTask(ErpPrincipal principal, long taskId) {
        return accessService.getVisibleTask(principal, taskId);
    }

    @Transactional
    ErpTask createTask(
            ErpPrincipal principal,
            String title,
            String description,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds,
            Long responsibleUserId,
            String priority,
            Instant deadlineAt
    ) {
        ErpValidation.requireAdmin(principal);
        String normalizedTitle = ErpValidation.normalizeTitle(title);
        TaskPriority parsedPriority = ErpValidation.parse(TaskPriority.class, priority, "Unknown task priority");
        Set<Long> userIds = new LinkedHashSet<>(assigneeUserIds == null ? List.of() : assigneeUserIds);
        Set<Long> teamIds = new LinkedHashSet<>(assigneeTeamIds == null ? List.of() : assigneeTeamIds);
        accessService.validateTargets(userIds, teamIds);
        if (responsibleUserId != null && !userIds.contains(responsibleUserId)) {
            throw new ErpExceptions.BadRequest("Responsible user must be assigned to the task");
        }

        Instant now = clock.instant();
        ErpTask task = taskRepository.saveAndFlush(ErpTask.create(
                normalizedTitle,
                ErpValidation.normalizeOptional(description),
                null,
                parsedPriority,
                deadlineAt,
                now));

        List<ErpTaskAssignment> assignments = new ArrayList<>();
        userIds.forEach(userId -> assignments.add(ErpTaskAssignment.forUser(
                task.getId(),
                userId,
                responsibleUserId != null && responsibleUserId.equals(userId) ? "responsible" : "participant",
                now)));
        teamIds.forEach(teamId -> assignments.add(ErpTaskAssignment.forTeam(task.getId(), teamId, now)));
        assignmentRepository.saveAll(assignments);
        userIds.forEach(userId -> activityRecorder.record(
                principal,
                "TASK_ASSIGNEE_ADDED",
                "TASK_ASSIGNMENT",
                task.getId() + ":user:" + userId,
                task.getId(),
                "assignee_user_id=" + userId));
        teamIds.forEach(teamId -> activityRecorder.record(
                principal,
                "TASK_ASSIGNEE_ADDED",
                "TASK_ASSIGNMENT",
                task.getId() + ":team:" + teamId,
                task.getId(),
                "assignee_team_id=" + teamId));
        Set<Long> notificationRecipients = new LinkedHashSet<>(userIds);
        if (!teamIds.isEmpty()) {
            teamMemberRepository.findAllByTeamIdIn(teamIds)
                    .forEach(member -> notificationRecipients.add(member.getUserId()));
        }
        notificationService.notifyUsers(
                notificationRecipients,
                "task_assigned",
                "New task assigned",
                task.getTitle(),
                task.getId(),
                "NORMAL",
                "task_assigned:" + task.getId(),
                now);
        activityRecorder.record(
                principal,
                "TASK_CREATED",
                "TASK",
                task.getId().toString(),
                task.getId(),
                "priority=" + task.getPriority().name().toLowerCase(Locale.ROOT)
                        + "; assignee_user_count=" + userIds.size()
                        + "; assignee_team_count=" + teamIds.size());
        return task;
    }

    @Transactional
    ErpTask createTaskFromTemplate(
            ErpWorkflowTemplate template,
            Collection<ErpWorkflowTemplateAssignment> templateAssignments,
            Instant scheduledFor
    ) {
        if (taskRepository.existsByWorkflowTemplateIdAndScheduledFor(template.getId(), scheduledFor)) {
            return null;
        }
        Instant now = clock.instant();
        ErpTask task = taskRepository.saveAndFlush(ErpTask.fromWorkflowTemplate(
                template.getTaskTitle(),
                template.getTaskDescription(),
                template.getTaskPriority(),
                template.deadlineFor(scheduledFor),
                template.getId(),
                scheduledFor,
                now));

        Set<Long> userIds = new LinkedHashSet<>();
        Set<Long> teamIds = new LinkedHashSet<>();
        List<ErpTaskAssignment> assignments = new ArrayList<>();
        for (ErpWorkflowTemplateAssignment assignment : templateAssignments) {
            if (assignment.getAssigneeUserId() != null) {
                userIds.add(assignment.getAssigneeUserId());
                assignments.add(ErpTaskAssignment.forUser(task.getId(), assignment.getAssigneeUserId(), now));
            } else if (assignment.getAssigneeTeamId() != null) {
                teamIds.add(assignment.getAssigneeTeamId());
                assignments.add(ErpTaskAssignment.forTeam(task.getId(), assignment.getAssigneeTeamId(), now));
            }
        }
        assignmentRepository.saveAll(assignments);

        Set<Long> notificationRecipients = new LinkedHashSet<>(userIds);
        if (!teamIds.isEmpty()) {
            teamMemberRepository.findAllByTeamIdIn(teamIds)
                    .forEach(member -> notificationRecipients.add(member.getUserId()));
        }
        notificationService.notifyUsers(
                notificationRecipients,
                "task_assigned",
                "Recurring task assigned",
                task.getTitle(),
                task.getId(),
                "NORMAL",
                "task_assigned:" + task.getId(),
                now);
        activityRecorder.recordActor(
                "system",
                null,
                "workflow-template",
                "RECURRING_TASK_CREATED",
                "TASK",
                task.getId().toString(),
                task.getId(),
                "workflow_template_id=" + template.getId()
                        + "; scheduled_for=" + scheduledFor
                        + "; assignee_user_count=" + userIds.size()
                        + "; assignee_team_count=" + teamIds.size());
        return task;
    }

    @Transactional
    ErpTask updateTaskStatus(ErpPrincipal principal, long taskId, String status) {
        ErpTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Task not found"));
        return applyStatusTransition(principal, task, status);
    }

    @Transactional
    ErpTask updateTaskDetails(
            ErpPrincipal principal,
            long taskId,
            String title,
            String description,
            String priority,
            Instant deadlineAt,
            boolean clearDeadline,
            String status
    ) {
        ErpValidation.requireAdmin(principal);
        if (deadlineAt != null && clearDeadline) {
            throw new ErpExceptions.BadRequest("deadline_at cannot be combined with clear_deadline");
        }
        ErpTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Task not found"));

        // PATCH semantics: absent fields stay unchanged; a blank description clears it.
        String newTitle = title == null ? task.getTitle() : ErpValidation.normalizeTitle(title);
        String newDescription = description == null
                ? task.getDescription()
                : ErpValidation.normalizeOptional(description);
        TaskPriority newPriority = priority == null
                ? task.getPriority()
                : ErpValidation.parse(TaskPriority.class, priority, "Unknown task priority");
        Instant newDeadline = clearDeadline ? null : (deadlineAt != null ? deadlineAt : task.getDeadlineAt());

        List<String> changedFields = new ArrayList<>();
        if (!newTitle.equals(task.getTitle())) {
            changedFields.add("title");
        }
        if (!java.util.Objects.equals(newDescription, task.getDescription())) {
            changedFields.add("description");
        }
        if (newPriority != task.getPriority()) {
            changedFields.add("priority");
        }
        boolean deadlineChanged = !java.util.Objects.equals(newDeadline, task.getDeadlineAt());
        if (deadlineChanged) {
            changedFields.add("deadline");
        }

        if (!changedFields.isEmpty()) {
            Instant now = clock.instant();
            try {
                task.edit(newTitle, newDescription, newPriority, newDeadline, now);
            } catch (IllegalStateException exception) {
                throw new ErpExceptions.BadRequest(exception.getMessage());
            }
            if (deadlineChanged) {
                notificationService.rearmDeadlineAlerts(taskId);
            }
            activityRecorder.record(
                    principal,
                    "TASK_UPDATED",
                    "TASK",
                    String.valueOf(taskId),
                    taskId,
                    "fields=" + String.join(",", changedFields)
                            + (deadlineChanged
                                    ? "; deadline_at=" + (newDeadline == null ? "none" : newDeadline)
                                    : ""));
            notificationService.notifyUsers(
                    accessService.assignedUserIds(taskId),
                    "task_updated",
                    "Task updated",
                    task.getTitle(),
                    task.getId(),
                    newPriority == TaskPriority.URGENT ? "HIGH" : "NORMAL",
                    null,
                    now);
        }
        if (status != null && !status.isBlank()) {
            applyStatusTransition(principal, task, status);
        }
        return task;
    }

    private ErpTask applyStatusTransition(ErpPrincipal principal, ErpTask task, String status) {
        long taskId = task.getId();
        TaskStatus nextStatus = ErpValidation.parse(TaskStatus.class, status, "Unknown task status");

        if (principal.admin()) {
            if (nextStatus == TaskStatus.DONE || nextStatus == TaskStatus.PENDING_APPROVAL) {
                throw new ErpExceptions.BadRequest(
                        "Completion must use the employee request and admin approval workflow");
            }
        } else {
            long userId = principal.requireUserId();
            if (!accessService.isAssigned(taskId, userId)) {
                throw new ErpExceptions.Forbidden("Task is not assigned to this employee");
            }
            boolean allowed = nextStatus == TaskStatus.IN_PROGRESS || nextStatus == TaskStatus.BLOCKED;
            if (!allowed) {
                throw new ErpExceptions.Forbidden("Employees can only start or block assigned tasks");
            }
        }

        try {
            task.transitionTo(nextStatus, clock.instant());
        } catch (IllegalStateException exception) {
            throw new ErpExceptions.BadRequest(exception.getMessage());
        }
        activityRecorder.record(
                principal,
                "TASK_STATUS_CHANGED",
                "TASK",
                String.valueOf(taskId),
                taskId,
                "status=" + task.getStatus().name().toLowerCase(Locale.ROOT));
        return task;
    }

    @Transactional
    List<ErpTask> bulkUpdateTaskStatus(ErpPrincipal principal, Collection<Long> taskIds, String status) {
        ErpValidation.requireAdmin(principal);
        List<Long> ids = normalizeIds(taskIds, "At least one task id is required");
        TaskStatus nextStatus = ErpValidation.parse(TaskStatus.class, status, "Unknown task status");
        if (nextStatus == TaskStatus.DONE || nextStatus == TaskStatus.PENDING_APPROVAL) {
            throw new ErpExceptions.BadRequest(
                    "Completion must use the employee request and admin approval workflow");
        }
        List<ErpTask> tasks = tasksInRequestOrder(ids);
        Instant now = clock.instant();
        for (ErpTask task : tasks) {
            try {
                task.transitionTo(nextStatus, now);
            } catch (IllegalStateException exception) {
                throw new ErpExceptions.BadRequest(exception.getMessage());
            }
            activityRecorder.record(
                    principal,
                    "TASK_STATUS_CHANGED",
                    "TASK",
                    String.valueOf(task.getId()),
                    task.getId(),
                    "status=" + task.getStatus().name().toLowerCase(Locale.ROOT)
                            + "; bulk=true");
        }
        return tasks;
    }

    @Transactional
    List<ErpTask> bulkAddTaskAssignees(
            ErpPrincipal principal,
            Collection<Long> taskIds,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds
    ) {
        ErpValidation.requireAdmin(principal);
        List<Long> ids = normalizeIds(taskIds, "At least one task id is required");
        Set<Long> userIds = new LinkedHashSet<>(assigneeUserIds == null ? List.of() : assigneeUserIds);
        Set<Long> teamIds = new LinkedHashSet<>(assigneeTeamIds == null ? List.of() : assigneeTeamIds);
        if (userIds.isEmpty() && teamIds.isEmpty()) {
            throw new ErpExceptions.BadRequest("At least one assignee is required");
        }
        accessService.validateTargets(userIds, teamIds);
        List<ErpTask> tasks = tasksInRequestOrder(ids);
        Instant now = clock.instant();
        Set<String> existing = new LinkedHashSet<>();
        assignmentRepository.findAllByTaskIdInOrderByIdAsc(ids).forEach(assignment -> {
            if (assignment.getAssigneeUserId() != null) {
                existing.add(assignment.getTaskId() + ":user:" + assignment.getAssigneeUserId());
            }
            if (assignment.getAssigneeTeamId() != null) {
                existing.add(assignment.getTaskId() + ":team:" + assignment.getAssigneeTeamId());
            }
        });

        List<ErpTaskAssignment> newAssignments = new ArrayList<>();
        for (ErpTask task : tasks) {
            for (Long userId : userIds) {
                String key = task.getId() + ":user:" + userId;
                if (existing.add(key)) {
                    newAssignments.add(ErpTaskAssignment.forUser(task.getId(), userId, now));
                    activityRecorder.record(
                            principal,
                            "TASK_ASSIGNEE_ADDED",
                            "TASK_ASSIGNMENT",
                            key,
                            task.getId(),
                            "assignee_user_id=" + userId + "; bulk=true");
                }
            }
            for (Long teamId : teamIds) {
                String key = task.getId() + ":team:" + teamId;
                if (existing.add(key)) {
                    newAssignments.add(ErpTaskAssignment.forTeam(task.getId(), teamId, now));
                    activityRecorder.record(
                            principal,
                            "TASK_ASSIGNEE_ADDED",
                            "TASK_ASSIGNMENT",
                            key,
                            task.getId(),
                            "assignee_team_id=" + teamId + "; bulk=true");
                }
            }
        }
        assignmentRepository.saveAll(newAssignments);
        Set<Long> notificationRecipients = new LinkedHashSet<>(userIds);
        if (!teamIds.isEmpty()) {
            teamMemberRepository.findAllByTeamIdIn(teamIds)
                    .forEach(member -> notificationRecipients.add(member.getUserId()));
        }
        if (!notificationRecipients.isEmpty() && !newAssignments.isEmpty()) {
            for (ErpTask task : tasks) {
                notificationService.notifyUsers(
                        notificationRecipients,
                        "task_assigned",
                        "New task assigned",
                        task.getTitle(),
                        task.getId(),
                        "NORMAL",
                        "task_assigned:" + task.getId(),
                        now);
            }
        }
        return tasks;
    }

    @Transactional
    ErpTask requestTaskCompletion(ErpPrincipal principal, long taskId, String note) {
        if (principal.admin()) {
            throw new ErpExceptions.Forbidden("Only assigned employees can request completion");
        }
        long userId = principal.requireUserId();
        ErpTask task = accessService.requireTask(taskId);
        if (!accessService.isAssigned(taskId, userId)) {
            throw new ErpExceptions.Forbidden("Task is not assigned to this employee");
        }
        try {
            task.requestCompletion();
        } catch (IllegalStateException exception) {
            throw new ErpExceptions.BadRequest(exception.getMessage());
        }
        Instant now = clock.instant();
        commentRepository.save(ErpTaskComment.create(
                taskId,
                userId,
                ErpValidation.normalizeMessage(
                        note,
                        "Employee reported the task as complete. Admin approval is pending."),
                "completion_request",
                now));
        notificationService.notifyAdmin(
                "task_completion_requested",
                "Task completion approval is pending",
                task.getTitle(),
                task.getId(),
                "HIGH",
                null,
                now);
        activityRecorder.record(
                principal,
                "TASK_COMPLETION_REQUESTED",
                "TASK",
                String.valueOf(taskId),
                taskId,
                null);
        return task;
    }

    @Transactional
    ErpTask approveTaskCompletion(ErpPrincipal principal, long taskId) {
        ErpValidation.requireAdmin(principal);
        ErpTask task = accessService.requireTask(taskId);
        Instant now = clock.instant();
        try {
            task.approveCompletion(now);
        } catch (IllegalStateException exception) {
            throw new ErpExceptions.BadRequest(exception.getMessage());
        }
        commentRepository.save(ErpTaskComment.create(
                taskId,
                null,
                principal.displayName() + " approved successful task completion.",
                "completion_approved",
                now));
        notificationService.notifyUsers(
                accessService.assignedUserIds(taskId),
                "task_completion_approved",
                "Your task was approved",
                task.getTitle(),
                task.getId(),
                "NORMAL",
                null,
                now);
        activityRecorder.record(
                principal,
                "TASK_COMPLETION_APPROVED",
                "TASK",
                String.valueOf(taskId),
                taskId,
                null);
        return task;
    }

    @Transactional
    ErpTask rejectTaskCompletion(ErpPrincipal principal, long taskId, String note) {
        ErpValidation.requireAdmin(principal);
        ErpTask task = accessService.requireTask(taskId);
        try {
            task.rejectCompletion();
        } catch (IllegalStateException exception) {
            throw new ErpExceptions.BadRequest(exception.getMessage());
        }
        Instant now = clock.instant();
        commentRepository.save(ErpTaskComment.create(
                taskId,
                null,
                ErpValidation.normalizeMessage(note, principal.displayName() + " returned the task for further work."),
                "completion_rejected",
                now));
        notificationService.notifyUsers(
                accessService.assignedUserIds(taskId),
                "task_completion_rejected",
                "Task returned for further work",
                task.getTitle(),
                task.getId(),
                "HIGH",
                null,
                now);
        activityRecorder.record(
                principal,
                "TASK_COMPLETION_REJECTED",
                "TASK",
                String.valueOf(taskId),
                taskId,
                null);
        return task;
    }

    private static <T> List<T> slice(List<T> values, int offset, int limit) {
        if (offset >= values.size()) {
            return List.of();
        }
        int toIndex = Math.min(values.size(), offset + limit);
        return values.subList(offset, toIndex);
    }

    private List<ErpTask> tasksInRequestOrder(List<Long> ids) {
        Map<Long, ErpTask> tasksById = new LinkedHashMap<>();
        taskRepository.findAllById(ids).forEach(task -> tasksById.put(task.getId(), task));
        if (tasksById.size() != ids.size()) {
            throw new ErpExceptions.NotFound("One or more tasks were not found");
        }
        return ids.stream().map(tasksById::get).toList();
    }

    private List<Long> normalizeIds(Collection<Long> ids, String message) {
        List<Long> normalized = new ArrayList<>(new LinkedHashSet<>(ids == null ? List.of() : ids));
        if (normalized.isEmpty()) {
            throw new ErpExceptions.BadRequest(message);
        }
        return normalized;
    }
}
