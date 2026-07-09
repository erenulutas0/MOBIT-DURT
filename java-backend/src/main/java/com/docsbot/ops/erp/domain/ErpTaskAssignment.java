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

    @Column(name = "role", nullable = false, length = 32)
    private String role = "participant";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTaskAssignment() {
    }

    public static ErpTaskAssignment forUser(long taskId, long userId, Instant now) {
        return forUser(taskId, userId, "participant", now);
    }

    public static ErpTaskAssignment forUser(long taskId, long userId, String role, Instant now) {
        ErpTaskAssignment assignment = new ErpTaskAssignment();
        assignment.taskId = taskId;
        assignment.assigneeUserId = userId;
        assignment.role = normalizeRole(role);
        assignment.createdAt = now;
        return assignment;
    }

    public static ErpTaskAssignment forTeam(long taskId, long teamId, Instant now) {
        ErpTaskAssignment assignment = new ErpTaskAssignment();
        assignment.taskId = taskId;
        assignment.assigneeTeamId = teamId;
        assignment.role = "participant";
        assignment.createdAt = now;
        return assignment;
    }

    private static String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "participant";
        }
        return role.trim().toLowerCase(java.util.Locale.ROOT);
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

    public String getRole() {
        return role;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
