package com.docsbot.ops.tender;

import java.time.Instant;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.AuthAuditEvent;
import com.docsbot.ops.auth.infrastructure.AuthAuditEventRepository;

@Service
@Profile("postgres")
class DocumentShareAuditService {
    private final AuthAuditEventRepository repository;

    DocumentShareAuditService(AuthAuditEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void record(String actor, String eventType, long documentId, Instant now) {
        repository.save(AuthAuditEvent.create(
                truncate(actor, 255),
                eventType,
                "tender_document",
                Long.toString(documentId),
                "success",
                now));
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
