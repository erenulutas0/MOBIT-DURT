package com.docsbot.ops.erp.application;

public interface ErpActivityRecorder {

    void record(
            ErpPrincipal principal,
            String eventType,
            String subjectType,
            String subjectId,
            Long taskId,
            String details
    );

    void recordActor(
            String actorType,
            Long actorUserId,
            String actorName,
            String eventType,
            String subjectType,
            String subjectId,
            Long taskId,
            String details
    );
}
