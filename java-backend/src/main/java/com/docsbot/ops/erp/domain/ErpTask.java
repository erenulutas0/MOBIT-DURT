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

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "workflow_template_id")
    private Long workflowTemplateId;

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

    public void edit(String title, String description, TaskPriority priority, Instant deadlineAt, Instant now) {
        if (status == TaskStatus.DONE || status == TaskStatus.CANCELLED) {
            throw new IllegalStateException("Closed tasks cannot be edited");
        }
        this.title = title;
        this.description = description;
        this.priority = priority;
        this.deadlineAt = deadlineAt;
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

    public Instant getDeadlineAt() {
        return deadlineAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Long getWorkflowTemplateId() {
        return workflowTemplateId;
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
