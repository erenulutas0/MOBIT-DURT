package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_workflow_template_assignments")
public class ErpWorkflowTemplateAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "template_id", nullable = false)
    private Long templateId;

    @Column(name = "assignee_user_id")
    private Long assigneeUserId;

    @Column(name = "assignee_team_id")
    private Long assigneeTeamId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpWorkflowTemplateAssignment() {
    }

    public static ErpWorkflowTemplateAssignment forUser(long templateId, long userId, Instant now) {
        ErpWorkflowTemplateAssignment assignment = new ErpWorkflowTemplateAssignment();
        assignment.templateId = templateId;
        assignment.assigneeUserId = userId;
        assignment.createdAt = now;
        return assignment;
    }

    public static ErpWorkflowTemplateAssignment forTeam(long templateId, long teamId, Instant now) {
        ErpWorkflowTemplateAssignment assignment = new ErpWorkflowTemplateAssignment();
        assignment.templateId = templateId;
        assignment.assigneeTeamId = teamId;
        assignment.createdAt = now;
        return assignment;
    }

    public Long getId() { return id; }
    public Long getTemplateId() { return templateId; }
    public Long getAssigneeUserId() { return assigneeUserId; }
    public Long getAssigneeTeamId() { return assigneeTeamId; }
    public Instant getCreatedAt() { return createdAt; }
}
