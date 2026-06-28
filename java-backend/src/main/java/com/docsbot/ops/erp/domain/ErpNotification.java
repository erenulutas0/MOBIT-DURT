package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_notifications")
public class ErpNotification {

    public static final long ADMIN_RECIPIENT_ID = 0L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 64)
    private String type;

    @Column(nullable = false)
    private String title;

    private String body;

    @Column(name = "task_id")
    private Long taskId;

    @Column(nullable = false, length = 32)
    private String priority = "NORMAL";

    @Column(name = "event_key", length = 160)
    private String eventKey;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpNotification() {
    }

    public static ErpNotification create(
            long userId,
            String type,
            String title,
            String body,
            Instant createdAt
    ) {
        return create(userId, type, title, body, null, "NORMAL", null, createdAt);
    }

    public static ErpNotification create(
            long userId,
            String type,
            String title,
            String body,
            Long taskId,
            String priority,
            String eventKey,
            Instant createdAt
    ) {
        ErpNotification notification = new ErpNotification();
        notification.userId = userId;
        notification.type = type;
        notification.title = title;
        notification.body = body;
        notification.taskId = taskId;
        notification.priority = priority == null || priority.isBlank() ? "NORMAL" : priority;
        notification.eventKey = eventKey;
        notification.createdAt = createdAt;
        return notification;
    }

    public void markRead(Instant readAt) {
        if (this.readAt == null) {
            this.readAt = readAt;
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getPriority() {
        return priority;
    }

    public String getEventKey() {
        return eventKey;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
