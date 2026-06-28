package com.docsbot.ops.auth.application;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("!postgres")
public class NoopAuthAuditRecorder implements AuthAuditRecorder {

    @Override
    public void record(
            String actor,
            String eventType,
            String subjectType,
            String subjectId,
            String outcome
    ) {
        // Database-free profiles intentionally do not persist audit events.
    }
}
