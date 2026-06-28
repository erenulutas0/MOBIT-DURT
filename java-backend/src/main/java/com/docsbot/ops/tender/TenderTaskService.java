package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.Collection;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.ErpService;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskDocument;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class TenderTaskService {

    private final TenderDocumentRepository tenderDocumentRepository;
    private final ErpService erpService;

    public TenderTaskService(
            TenderDocumentRepository tenderDocumentRepository,
            ErpService erpService
    ) {
        this.tenderDocumentRepository = tenderDocumentRepository;
        this.erpService = erpService;
    }

    @Transactional
    public Result createTaskFromDocument(
            ErpPrincipal principal,
            long documentId,
            String title,
            String description,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds,
            String priority,
            Instant deadlineAt
    ) {
        TenderDocument document = tenderDocumentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        ErpTask task = erpService.createTask(
                principal,
                title,
                description,
                assigneeUserIds,
                assigneeTeamIds,
                priority,
                deadlineAt);
        ErpTaskDocument taskDocument = erpService.linkTenderDocument(
                principal,
                task.getId(),
                document.getId(),
                document.getOriginalFilename() != null
                        ? document.getOriginalFilename()
                        : document.getStoredFilename(),
                document.getFilePath());
        return new Result(task, taskDocument);
    }

    public record Result(ErpTask task, ErpTaskDocument document) {
    }
}
