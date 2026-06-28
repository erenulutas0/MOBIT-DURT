package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_task_comments")
public class ErpTaskComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "author_user_id")
    private Long authorUserId;

    @Column(nullable = false)
    private String body;

    @Column(nullable = false, length = 32)
    private String kind;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTaskComment() {
    }

    public static ErpTaskComment create(
            long taskId,
            Long authorUserId,
            String body,
            String kind,
            Instant createdAt
    ) {
        ErpTaskComment comment = new ErpTaskComment();
        comment.taskId = taskId;
        comment.authorUserId = authorUserId;
        comment.body = body;
        comment.kind = kind;
        comment.createdAt = createdAt;
        return comment;
    }

    public Long getId() {
        return id;
    }

    public Long getTaskId() {
        return taskId;
    }

    public Long getAuthorUserId() {
        return authorUserId;
    }

    public String getBody() {
        return body;
    }

    public String getKind() {
        return kind;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
