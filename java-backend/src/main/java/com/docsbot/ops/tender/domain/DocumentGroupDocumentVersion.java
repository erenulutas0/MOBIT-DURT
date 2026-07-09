package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_group_document_versions")
public class DocumentGroupDocumentVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_document_id", nullable = false)
    private Long groupDocumentId;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "version_number", nullable = false)
    private Integer versionNumber;

    @Column(name = "uploaded_by_user_id")
    private Long uploadedByUserId;

    @Column(name = "uploaded_by", nullable = false)
    private String uploadedBy;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentGroupDocumentVersion() {
    }

    public static DocumentGroupDocumentVersion create(
            long groupDocumentId,
            long documentId,
            int versionNumber,
            Long uploadedByUserId,
            String uploadedBy,
            String note,
            Instant now
    ) {
        DocumentGroupDocumentVersion value = new DocumentGroupDocumentVersion();
        value.groupDocumentId = groupDocumentId;
        value.documentId = documentId;
        value.versionNumber = versionNumber;
        value.uploadedByUserId = uploadedByUserId;
        value.uploadedBy = uploadedBy;
        value.note = note == null || note.isBlank() ? null : note.trim();
        value.createdAt = now;
        return value;
    }

    public Long getId() { return id; }
    public Long getGroupDocumentId() { return groupDocumentId; }
    public Long getDocumentId() { return documentId; }
    public Integer getVersionNumber() { return versionNumber; }
    public Long getUploadedByUserId() { return uploadedByUserId; }
    public String getUploadedBy() { return uploadedBy; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
}
