package com.docsbot.ops.auth.application;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.AuthAuditEvent;
import com.docsbot.ops.auth.infrastructure.AuthAuditEventRepository;

@Service
@Profile("postgres")
public class PersistentAuthAuditRecorder implements AuthAuditRecorder {

    private final AuthAuditEventRepository repository;
    private final Clock clock;

    @Autowired
    public PersistentAuthAuditRecorder(AuthAuditEventRepository repository) {
        this(repository, Clock.systemUTC());
    }

    PersistentAuthAuditRecorder(AuthAuditEventRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            String actor,
            String eventType,
            String subjectType,
            String subjectId,
            String outcome
    ) {
        repository.save(AuthAuditEvent.create(
                normalize(actor),
                eventType,
                subjectType,
                subjectId,
                outcome,
                clock.instant()));
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
