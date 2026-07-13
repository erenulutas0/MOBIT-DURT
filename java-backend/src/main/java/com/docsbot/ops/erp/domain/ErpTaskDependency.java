package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_task_dependencies")
public class ErpTaskDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "predecessor_task_id", nullable = false)
    private Long predecessorTaskId;

    @Column(name = "successor_task_id", nullable = false)
    private Long successorTaskId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTaskDependency() {
    }

    public static ErpTaskDependency create(long predecessorTaskId, long successorTaskId, Instant now) {
        ErpTaskDependency dependency = new ErpTaskDependency();
        dependency.predecessorTaskId = predecessorTaskId;
        dependency.successorTaskId = successorTaskId;
        dependency.createdAt = now;
        return dependency;
    }

    public Long getId() {
        return id;
    }

    public Long getPredecessorTaskId() {
        return predecessorTaskId;
    }

    public Long getSuccessorTaskId() {
        return successorTaskId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
