package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_activity_events")
public class ErpActivityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_type", nullable = false, length = 32)
    private String actorType;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "actor_name")
    private String actorName;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "subject_type", nullable = false, length = 64)
    private String subjectType;

    @Column(name = "subject_id", nullable = false, length = 128)
    private String subjectId;

    @Column(name = "task_id")
    private Long taskId;

    @Column(length = 2_000)
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpActivityEvent() {
    }

    public static ErpActivityEvent create(
            String actorType,
            Long actorUserId,
            String actorName,
            String eventType,
            String subjectType,
            String subjectId,
            Long taskId,
            String details,
            Instant createdAt
    ) {
        ErpActivityEvent event = new ErpActivityEvent();
        event.actorType = actorType;
        event.actorUserId = actorUserId;
        event.actorName = actorName;
        event.eventType = eventType;
        event.subjectType = subjectType;
        event.subjectId = subjectId;
        event.taskId = taskId;
        event.details = details;
        event.createdAt = createdAt;
        return event;
    }

    public Long getId() {
        return id;
    }

    public String getActorType() {
        return actorType;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public String getActorName() {
        return actorName;
    }

    public String getEventType() {
        return eventType;
    }

    public String getSubjectType() {
        return subjectType;
    }

    public String getSubjectId() {
        return subjectId;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getDetails() {
        return details;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
