package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_group_documents")
public class DocumentGroupDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "uploaded_by_user_id")
    private Long uploadedByUserId;

    @Column(name = "uploaded_by", nullable = false)
    private String uploadedBy;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "tender_id", length = 128)
    private String tenderId;

    @Column(name = "year")
    private Integer year;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentGroupDocument() {
    }

    public static DocumentGroupDocument create(
            long groupId,
            long documentId,
            Long uploadedByUserId,
            String uploadedBy,
            String note,
            String tenderId,
            Integer year,
            Instant now
    ) {
        DocumentGroupDocument value = new DocumentGroupDocument();
        value.groupId = groupId;
        value.documentId = documentId;
        value.uploadedByUserId = uploadedByUserId;
        value.uploadedBy = uploadedBy;
        value.note = note == null || note.isBlank() ? null : note.trim();
        value.tenderId = tenderId == null || tenderId.isBlank() ? null : tenderId.trim();
        value.year = year;
        value.createdAt = now;
        return value;
    }

    public Long getId() { return id; }
    public Long getGroupId() { return groupId; }
    public Long getDocumentId() { return documentId; }
    public Long getUploadedByUserId() { return uploadedByUserId; }
    public String getUploadedBy() { return uploadedBy; }
    public String getNote() { return note; }
    public String getTenderId() { return tenderId; }
    public Integer getYear() { return year; }
    public Instant getCreatedAt() { return createdAt; }

    public void reroute(String tenderId, Integer year) {
        this.tenderId = tenderId == null || tenderId.isBlank() ? null : tenderId.trim();
        this.year = year;
    }
}
