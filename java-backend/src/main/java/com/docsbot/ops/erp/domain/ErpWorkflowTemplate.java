package com.docsbot.ops.erp.domain;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

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
@Table(name = "erp_workflow_templates")
public class ErpWorkflowTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "task_title", nullable = false)
    private String taskTitle;

    @Column(name = "task_description")
    private String taskDescription;

    @Enumerated(EnumType.STRING)
    @Column(name = "task_priority", nullable = false, length = 32)
    private TaskPriority taskPriority;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence_type", nullable = false, length = 32)
    private WorkflowRecurrenceType recurrenceType;

    @Column(name = "recurrence_interval", nullable = false)
    private int recurrenceInterval;

    @Column(name = "recurrence_zone", nullable = false, length = 64)
    private String recurrenceZone;

    @Column(name = "deadline_offset_minutes")
    private Long deadlineOffsetMinutes;

    @Column(name = "next_run_at", nullable = false)
    private Instant nextRunAt;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected ErpWorkflowTemplate() {
    }

    public static ErpWorkflowTemplate create(
            String name,
            String taskTitle,
            String taskDescription,
            TaskPriority taskPriority,
            WorkflowRecurrenceType recurrenceType,
            int recurrenceInterval,
            String recurrenceZone,
            Long deadlineOffsetMinutes,
            Instant nextRunAt,
            String createdBy,
            Instant now
    ) {
        ErpWorkflowTemplate template = new ErpWorkflowTemplate();
        template.name = name;
        template.taskTitle = taskTitle;
        template.taskDescription = taskDescription;
        template.taskPriority = taskPriority;
        template.recurrenceType = recurrenceType;
        template.recurrenceInterval = recurrenceInterval;
        template.recurrenceZone = recurrenceZone;
        template.deadlineOffsetMinutes = deadlineOffsetMinutes;
        template.nextRunAt = nextRunAt;
        template.createdBy = createdBy;
        template.active = true;
        template.createdAt = now;
        template.updatedAt = now;
        return template;
    }

    public Instant deadlineFor(Instant scheduledFor) {
        return deadlineOffsetMinutes == null ? null : scheduledFor.plusSeconds(deadlineOffsetMinutes * 60);
    }

    public void markRun(Instant scheduledFor, Instant now) {
        lastRunAt = scheduledFor;
        ZonedDateTime current = scheduledFor.atZone(ZoneId.of(recurrenceZone));
        Instant next = nextOccurrence(current);
        while (!next.isAfter(now)) {
            current = next.atZone(ZoneId.of(recurrenceZone));
            next = nextOccurrence(current);
        }
        nextRunAt = next;
        updatedAt = now;
    }

    private Instant nextOccurrence(ZonedDateTime current) {
        return switch (recurrenceType) {
            case DAILY -> current.plusDays(recurrenceInterval).toInstant();
            case WEEKLY -> current.plusWeeks(recurrenceInterval).toInstant();
            case MONTHLY -> current.plusMonths(recurrenceInterval).toInstant();
        };
    }

    public void setActive(boolean active, Instant now) {
        this.active = active;
        this.updatedAt = now;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getTaskTitle() { return taskTitle; }
    public String getTaskDescription() { return taskDescription; }
    public TaskPriority getTaskPriority() { return taskPriority; }
    public WorkflowRecurrenceType getRecurrenceType() { return recurrenceType; }
    public int getRecurrenceInterval() { return recurrenceInterval; }
    public String getRecurrenceZone() { return recurrenceZone; }
    public Long getDeadlineOffsetMinutes() { return deadlineOffsetMinutes; }
    public Instant getNextRunAt() { return nextRunAt; }
    public Instant getLastRunAt() { return lastRunAt; }
    public boolean isActive() { return active; }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }
}
