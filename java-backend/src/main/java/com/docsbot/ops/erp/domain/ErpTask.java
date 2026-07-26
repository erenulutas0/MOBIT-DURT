package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "erp_tasks")
public class ErpTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    private String description;

    @Column(name = "assigned_by_user_id")
    private Long assignedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TaskStatus status = TaskStatus.TODO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TaskPriority priority = TaskPriority.NORMAL;

    @Column(name = "deadline_at")
    private Instant deadlineAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "schedule_kind", nullable = false, length = 16)
    private TaskScheduleKind scheduleKind = TaskScheduleKind.AT;

    /** Second anchor: "not before" for AFTER, window opening for BETWEEN; null for the rest. */
    @Column(name = "starts_at")
    private Instant startsAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "workflow_template_id")
    private Long workflowTemplateId;

    @Column(name = "parent_task_id")
    private Long parentTaskId;

    @Column(name = "document_group_id")
    private Long documentGroupId;

    @Column(name = "scheduled_for")
    private Instant scheduledFor;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected ErpTask() {
    }

    public static ErpTask create(
            String title,
            String description,
            Long assignedByUserId,
            TaskPriority priority,
            Instant deadlineAt,
            Instant now
    ) {
        ErpTask task = new ErpTask();
        task.title = title;
        task.description = description;
        task.assignedByUserId = assignedByUserId;
        task.priority = priority;
        task.deadlineAt = deadlineAt;
        task.status = TaskStatus.TODO;
        task.createdAt = now;
        return task;
    }

    /**
     * How this task's dates should be read. deadlineAt always means "must be done by", so the
     * due-soon and overdue ladders behave identically whichever kind is chosen; startsAt only adds
     * the "not before" end. Rejects combinations that would be meaningless rather than silently
     * storing them — a window with no opening, or an opening that falls after its own deadline.
     */
    public void schedule(TaskScheduleKind kind, Instant startsAt, Instant deadlineAt) {
        TaskScheduleKind resolved = kind == null ? TaskScheduleKind.AT : kind;
        if (resolved.isStartRequired() && startsAt == null) {
            throw new IllegalArgumentException("Bu zamanlama türü için başlangıç tarihi gerekli");
        }
        if (resolved.isDeadlineRequired() && deadlineAt == null) {
            throw new IllegalArgumentException("Bu zamanlama türü için termin tarihi gerekli");
        }
        Instant resolvedStart = resolved.ignoresStart() ? null : startsAt;
        if (resolvedStart != null && deadlineAt != null && resolvedStart.isAfter(deadlineAt)) {
            throw new IllegalArgumentException("Başlangıç tarihi terminden sonra olamaz");
        }
        this.scheduleKind = resolved;
        this.startsAt = resolvedStart;
        this.deadlineAt = deadlineAt;
    }

    public static ErpTask fromWorkflowTemplate(
            String title,
            String description,
            TaskPriority priority,
            Instant deadlineAt,
            long workflowTemplateId,
            Instant scheduledFor,
            Instant now
    ) {
        ErpTask task = create(title, description, null, priority, deadlineAt, now);
        task.workflowTemplateId = workflowTemplateId;
        task.scheduledFor = scheduledFor;
        return task;
    }

    /** Set at creation time only: subtasks are limited to one level of nesting. */
    public void assignParent(long parentTaskId) {
        if (this.parentTaskId != null) {
            throw new IllegalStateException("Task already has a parent");
        }
        this.parentTaskId = parentTaskId;
    }

    public boolean isOpen() {
        return status != TaskStatus.DONE && status != TaskStatus.CANCELLED;
    }

    /** Links the optional collaboration room created alongside this task. Set once, at or shortly after creation. */
    public void linkDocumentGroup(long documentGroupId) {
        if (this.documentGroupId != null) {
            throw new IllegalStateException("Task already has a linked document room");
        }
        this.documentGroupId = documentGroupId;
    }

    public void edit(String title, String description, TaskPriority priority, Instant deadlineAt, Instant now) {
        edit(title, description, priority, scheduleKind, startsAt, deadlineAt, now);
    }

    public void edit(
            String title,
            String description,
            TaskPriority priority,
            TaskScheduleKind scheduleKind,
            Instant startsAt,
            Instant deadlineAt,
            Instant now
    ) {
        if (status == TaskStatus.DONE || status == TaskStatus.CANCELLED) {
            throw new IllegalStateException("Closed tasks cannot be edited");
        }
        this.title = title;
        this.description = description;
        this.priority = priority;
        schedule(scheduleKind, startsAt, deadlineAt);
        if (status == TaskStatus.OVERDUE && (deadlineAt == null || deadlineAt.isAfter(now))) {
            status = TaskStatus.TODO;
        }
    }

    public void transitionTo(TaskStatus nextStatus, Instant now) {
        if (status == TaskStatus.DONE || status == TaskStatus.CANCELLED) {
            throw new IllegalStateException("Closed tasks cannot change status");
        }
        status = nextStatus;
        completedAt = nextStatus == TaskStatus.DONE ? now : null;
    }

    public void requestCompletion() {
        if (status == TaskStatus.DONE || status == TaskStatus.CANCELLED) {
            throw new IllegalStateException("Task is already closed");
        }
        if (status == TaskStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Task is already waiting for completion approval");
        }
        status = TaskStatus.PENDING_APPROVAL;
        completedAt = null;
    }

    public void approveCompletion(Instant now) {
        requirePendingApproval();
        status = TaskStatus.DONE;
        completedAt = now;
    }

    public void rejectCompletion() {
        requirePendingApproval();
        status = TaskStatus.IN_PROGRESS;
        completedAt = null;
    }

    public boolean markOverdue(Instant now) {
        boolean open = status == TaskStatus.TODO
                || status == TaskStatus.IN_PROGRESS
                || status == TaskStatus.BLOCKED;
        if (!open || deadlineAt == null || !deadlineAt.isBefore(now)) {
            return false;
        }
        status = TaskStatus.OVERDUE;
        completedAt = null;
        return true;
    }

    private void requirePendingApproval() {
        if (status != TaskStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Task is not waiting for completion approval");
        }
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public Long getAssignedByUserId() {
        return assignedByUserId;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public TaskPriority getPriority() {
        return priority;
    }

    public TaskScheduleKind getScheduleKind() {
        return scheduleKind;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getDeadlineAt() {
        return deadlineAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Long getWorkflowTemplateId() {
        return workflowTemplateId;
    }

    public Long getParentTaskId() {
        return parentTaskId;
    }

    public Long getDocumentGroupId() {
        return documentGroupId;
    }

    public Instant getScheduledFor() {
        return scheduledFor;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version;
    }
}
