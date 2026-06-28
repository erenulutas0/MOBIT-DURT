package com.docsbot.ops.auth.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "auth_audit_events")
public class AuthAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String actor;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "subject_type", length = 64)
    private String subjectType;

    @Column(name = "subject_id", length = 128)
    private String subjectId;

    @Column(nullable = false, length = 32)
    private String outcome;

    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AuthAuditEvent() {
    }

    public static AuthAuditEvent create(
            String actor,
            String eventType,
            String subjectType,
            String subjectId,
            String outcome,
            Instant createdAt
    ) {
        AuthAuditEvent event = new AuthAuditEvent();
        event.actor = actor;
        event.eventType = eventType;
        event.subjectType = subjectType;
        event.subjectId = subjectId;
        event.outcome = outcome;
        event.createdAt = createdAt;
        return event;
    }

    public Long getId() {
        return id;
    }

    public String getActor() {
        return actor;
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

    public String getOutcome() {
        return outcome;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
