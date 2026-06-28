package com.docsbot.ops.auth.application;

public interface AuthAuditRecorder {

    void record(
            String actor,
            String eventType,
            String subjectType,
            String subjectId,
            String outcome
    );
}
