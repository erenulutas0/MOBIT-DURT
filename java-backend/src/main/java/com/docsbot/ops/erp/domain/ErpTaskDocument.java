package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_task_documents")
public class ErpTaskDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "document_id")
    private Long documentId;

    @Column(name = "original_filename")
    private String originalFilename;

    @Column(name = "file_path")
    private String filePath;

    @Column(nullable = false, length = 32)
    private String visibility;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTaskDocument() {
    }

    public static ErpTaskDocument uploaded(
            long taskId,
            String originalFilename,
            String filePath,
            Instant createdAt
    ) {
        ErpTaskDocument document = new ErpTaskDocument();
        document.taskId = taskId;
        document.originalFilename = originalFilename;
        document.filePath = filePath;
        document.visibility = "assignees";
        document.createdAt = createdAt;
        return document;
    }

    public static ErpTaskDocument linked(
            long taskId,
            long documentId,
            String originalFilename,
            String filePath,
            Instant createdAt
    ) {
        ErpTaskDocument document = new ErpTaskDocument();
        document.taskId = taskId;
        document.documentId = documentId;
        document.originalFilename = originalFilename;
        document.filePath = filePath;
        document.visibility = "assignees";
        document.createdAt = createdAt;
        return document;
    }

    public Long getId() {
        return id;
    }

    public Long getTaskId() {
        return taskId;
    }

    public Long getDocumentId() {
        return documentId;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getFilePath() {
        return filePath;
    }

    public String getVisibility() {
        return visibility;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
