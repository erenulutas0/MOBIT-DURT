package com.docsbot.ops.erp.application;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;

@Service
@Profile("postgres")
public class PersistentErpActivityRecorder implements ErpActivityRecorder {

    private final ErpActivityEventRepository repository;
    private final Clock clock;

    @Autowired
    public PersistentErpActivityRecorder(ErpActivityEventRepository repository) {
        this(repository, Clock.systemUTC());
    }

    PersistentErpActivityRecorder(ErpActivityEventRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Override
    public void record(
            ErpPrincipal principal,
            String eventType,
            String subjectType,
            String subjectId,
            Long taskId,
            String details
    ) {
        recordActor(
                principal.admin() ? "admin" : "user",
                principal.userId().isPresent() ? principal.userId().getAsLong() : null,
                principal.displayName(),
                eventType,
                subjectType,
                subjectId,
                taskId,
                details);
    }

    @Override
    public void recordActor(
            String actorType,
            Long actorUserId,
            String actorName,
            String eventType,
            String subjectType,
            String subjectId,
            Long taskId,
            String details
    ) {
        repository.save(ErpActivityEvent.create(
                normalizeRequired(actorType, "system"),
                actorUserId,
                normalize(actorName),
                eventType,
                subjectType,
                subjectId,
                taskId,
                truncate(normalize(details)),
                clock.instant()));
    }

    private String normalizeRequired(String value, String fallback) {
        String normalized = normalize(value);
        return normalized == null ? fallback : normalized;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String truncate(String value) {
        if (value == null || value.length() <= 2_000) {
            return value;
        }
        return value.substring(0, 2_000);
    }
}
