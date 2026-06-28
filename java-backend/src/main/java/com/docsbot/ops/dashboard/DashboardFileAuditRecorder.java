package com.docsbot.ops.dashboard;

import java.time.Clock;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.auth.domain.AuthAuditEvent;
import com.docsbot.ops.auth.infrastructure.AuthAuditEventRepository;
import com.docsbot.ops.erp.application.ErpPrincipal;

@Service
@Profile("postgres")
public class DashboardFileAuditRecorder {

    private final AuthAuditEventRepository repository;
    private final Clock clock;

    @Autowired
    public DashboardFileAuditRecorder(AuthAuditEventRepository repository) {
        this(repository, Clock.systemUTC());
    }

    DashboardFileAuditRecorder(AuthAuditEventRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public void record(ErpPrincipal principal, String eventType, String subjectType, String subjectId) {
        repository.save(AuthAuditEvent.create(
                principal.displayName(),
                eventType,
                subjectType,
                subjectId,
                "success",
                Instant.now(clock)));
    }
}
