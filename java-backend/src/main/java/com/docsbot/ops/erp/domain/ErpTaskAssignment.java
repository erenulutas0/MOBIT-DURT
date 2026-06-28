package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_task_assignments")
public class ErpTaskAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "assignee_user_id")
    private Long assigneeUserId;

    @Column(name = "assignee_team_id")
    private Long assigneeTeamId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTaskAssignment() {
    }

    public static ErpTaskAssignment forUser(long taskId, long userId, Instant now) {
        ErpTaskAssignment assignment = new ErpTaskAssignment();
        assignment.taskId = taskId;
        assignment.assigneeUserId = userId;
        assignment.createdAt = now;
        return assignment;
    }

    public static ErpTaskAssignment forTeam(long taskId, long teamId, Instant now) {
        ErpTaskAssignment assignment = new ErpTaskAssignment();
        assignment.taskId = taskId;
        assignment.assigneeTeamId = teamId;
        assignment.createdAt = now;
        return assignment;
    }

    public Long getId() {
        return id;
    }

    public Long getTaskId() {
        return taskId;
    }

    public Long getAssigneeUserId() {
        return assigneeUserId;
    }

    public Long getAssigneeTeamId() {
        return assigneeTeamId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
