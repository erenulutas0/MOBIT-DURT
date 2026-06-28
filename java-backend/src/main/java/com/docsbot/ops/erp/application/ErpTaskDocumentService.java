package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.domain.ErpTaskDocument;
import com.docsbot.ops.erp.infrastructure.ErpTaskDocumentRepository;

@Service
@Profile("postgres")
class ErpTaskDocumentService {
    private final ErpTaskDocumentRepository documentRepository;
    private final TaskDocumentStorage documentStorage;
    private final DashboardFileService dashboardFileService;
    private final ErpActivityRecorder activityRecorder;
    private final ErpTaskAccessService accessService;
    private final Clock clock;

    ErpTaskDocumentService(
            ErpTaskDocumentRepository documentRepository,
            TaskDocumentStorage documentStorage,
            DashboardFileService dashboardFileService,
            ErpActivityRecorder activityRecorder,
            ErpTaskAccessService accessService
    ) {
        this.documentRepository = documentRepository;
        this.documentStorage = documentStorage;
        this.dashboardFileService = dashboardFileService;
        this.activityRecorder = activityRecorder;
        this.accessService = accessService;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    List<ErpTaskDocument> listTaskDocuments(ErpPrincipal principal, long taskId) {
        accessService.getVisibleTask(principal, taskId);
        return documentRepository.findAllByTaskIdOrderByCreatedAtDescIdDesc(taskId);
    }

    @Transactional
    ErpTaskDocument uploadTaskDocument(ErpPrincipal principal, long taskId, MultipartFile file) {
        accessService.getVisibleTask(principal, taskId);
        TaskDocumentStorage.StoredFile stored = documentStorage.store(taskId, file);
        try {
            ErpTaskDocument document = documentRepository.saveAndFlush(ErpTaskDocument.uploaded(
                    taskId,
                    stored.originalFilename(),
                    stored.relativePath(),
                    clock.instant()));
            activityRecorder.record(
                    principal,
                    "TASK_DOCUMENT_UPLOADED",
                    "TASK_DOCUMENT",
                    document.getId().toString(),
                    taskId,
                    "filename=" + stored.originalFilename());
            return document;
        } catch (RuntimeException exception) {
            documentStorage.delete(stored.relativePath());
            throw exception;
        }
    }

    @Transactional
    ErpTaskDocument linkTenderDocument(
            ErpPrincipal principal,
            long taskId,
            long tenderDocumentId,
            String originalFilename,
            String filePath
    ) {
        ErpValidation.requireAdmin(principal);
        accessService.requireTask(taskId);
        dashboardFileService.documentFile(tenderDocumentId);
        ErpTaskDocument document = documentRepository.saveAndFlush(ErpTaskDocument.linked(
                taskId,
                tenderDocumentId,
                originalFilename,
                filePath,
                clock.instant()));
        activityRecorder.record(
                principal,
                "TASK_DOCUMENT_LINKED",
                "TASK_DOCUMENT",
                document.getId().toString(),
                taskId,
                "document_id=" + tenderDocumentId);
        return document;
    }

    @Transactional(readOnly = true)
    ErpService.TaskDocumentDownload readTaskDocument(ErpPrincipal principal, long documentId) {
        ErpTaskDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Task document not found"));
        accessService.getVisibleTask(principal, document.getTaskId());
        if (document.getFilePath() == null) {
            throw new ErpExceptions.NotFound("Task document file not found");
        }
        if (document.getDocumentId() != null) {
            DashboardFileService.StoredFile stored =
                    dashboardFileService.documentFile(document.getDocumentId());
            return new ErpService.TaskDocumentDownload(
                    document,
                    new TaskDocumentStorage.StoredContent(
                            stored.path(),
                            stored.contentType()));
        }
        TaskDocumentStorage.StoredContent stored = documentStorage.read(document.getFilePath());
        return new ErpService.TaskDocumentDownload(document, stored);
    }

    @Transactional
    void deleteTaskDocument(ErpPrincipal principal, long documentId) {
        ErpValidation.requireAdmin(principal);
        ErpTaskDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Task document not found"));
        documentRepository.delete(document);
        documentRepository.flush();
        if (document.getDocumentId() == null && document.getFilePath() != null) {
            documentStorage.delete(document.getFilePath());
        }
        activityRecorder.record(
                principal,
                "TASK_DOCUMENT_DELETED",
                "TASK_DOCUMENT",
                String.valueOf(documentId),
                document.getTaskId(),
                "filename=" + document.getOriginalFilename());
    }
}
