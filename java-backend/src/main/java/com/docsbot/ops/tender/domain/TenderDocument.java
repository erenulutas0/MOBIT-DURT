package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "documents")
public class TenderDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private String messageId;
    @Column(name = "sender_hash", nullable = false)
    private String senderHash;
    @Column(nullable = false)
    private String source;
    @Column(nullable = false)
    private Instant timestamp;
    @Column(name = "media_id", nullable = false)
    private String mediaId;
    @Column(name = "mime_type")
    private String mimeType;
    @Column(name = "original_filename")
    private String originalFilename;
    @Column(name = "stored_filename")
    private String storedFilename;
    private String caption;
    private String checksum;
    @Column(name = "file_path")
    private String filePath;
    @Column(name = "file_size")
    private Long fileSize;
    @Column(name = "internal_unit")
    private String internalUnit;
    private String organization;
    private Integer year;
    @Column(name = "tender_id", nullable = false)
    private String tenderId;
    @Column(name = "document_type", nullable = false)
    private String documentType;
    @Column(nullable = false)
    private String status;
    @Column(name = "error_message")
    private String errorMessage;
    @Column(name = "extracted_text", columnDefinition = "text")
    private String extractedText;
    @Column(
            name = "text_extraction_status",
            nullable = false,
            columnDefinition = "varchar(32) default 'pending'")
    private String textExtractionStatus = "pending";
    @Column(name = "text_extracted_at")
    private Instant textExtractedAt;
    @Column(name = "text_extraction_error", columnDefinition = "text")
    private String textExtractionError;
    @Column(name = "extracted_facts", columnDefinition = "text")
    private String extractedFacts;
    @Column(
            name = "fact_extraction_status",
            nullable = false,
            columnDefinition = "varchar(32) default 'pending'")
    private String factExtractionStatus = "pending";
    @Column(name = "fact_extracted_at")
    private Instant factExtractedAt;
    @Column(name = "fact_extraction_error", columnDefinition = "text")
    private String factExtractionError;
    @Column(name = "ai_summary", columnDefinition = "text")
    private String aiSummary;
    @Column(
            name = "ai_summary_status",
            nullable = false,
            columnDefinition = "varchar(32) default 'pending'")
    private String aiSummaryStatus = "pending";
    @Column(name = "ai_summary_generated_at")
    private Instant aiSummaryGeneratedAt;
    @Column(name = "ai_summary_error", columnDefinition = "text")
    private String aiSummaryError;
    @Column(name = "ai_risk_analysis", columnDefinition = "text")
    private String aiRiskAnalysis;
    @Column(
            name = "ai_risk_status",
            nullable = false,
            columnDefinition = "varchar(32) default 'pending'")
    private String aiRiskStatus = "pending";
    @Column(name = "ai_risk_generated_at")
    private Instant aiRiskGeneratedAt;
    @Column(name = "ai_risk_error", columnDefinition = "text")
    private String aiRiskError;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TenderDocument() {
    }

    public static TenderDocument ingested(
            String messageId,
            String senderHash,
            String source,
            Instant timestamp,
            String mediaId,
            String mimeType,
            String originalFilename,
            String storedFilename,
            String caption,
            String checksum,
            String filePath,
            long fileSize,
            String internalUnit,
            String organization,
            int year,
            String tenderId,
            String documentType,
            String status
    ) {
        TenderDocument document = new TenderDocument();
        document.messageId = messageId;
        document.senderHash = senderHash;
        document.source = source;
        document.timestamp = timestamp;
        document.mediaId = mediaId;
        document.mimeType = mimeType;
        document.originalFilename = originalFilename;
        document.storedFilename = storedFilename;
        document.caption = caption;
        document.checksum = checksum;
        document.filePath = filePath;
        document.fileSize = fileSize;
        document.internalUnit = internalUnit;
        document.organization = organization;
        document.year = year;
        document.tenderId = tenderId;
        document.documentType = documentType;
        document.status = status;
        document.createdAt = timestamp;
        return document;
    }

    public void markTextExtracted(String text, Instant extractedAt) {
        this.extractedText = text;
        this.textExtractionStatus = "extracted";
        this.textExtractedAt = extractedAt;
        this.textExtractionError = null;
    }

    public void markTextExtractionFailed(String error, Instant extractedAt) {
        this.extractedText = null;
        this.textExtractionStatus = "failed";
        this.textExtractedAt = extractedAt;
        this.textExtractionError = trimError(error);
    }

    public void markTextExtractionUnsupported(String error, Instant extractedAt) {
        this.extractedText = null;
        this.textExtractionStatus = "unsupported";
        this.textExtractedAt = extractedAt;
        this.textExtractionError = trimError(error);
    }

    public void markFactsExtracted(String facts, Instant extractedAt) {
        this.extractedFacts = facts;
        this.factExtractionStatus = "extracted";
        this.factExtractedAt = extractedAt;
        this.factExtractionError = null;
    }

    public void markFactExtractionFailed(String error, Instant extractedAt) {
        this.extractedFacts = null;
        this.factExtractionStatus = "failed";
        this.factExtractedAt = extractedAt;
        this.factExtractionError = trimError(error);
    }

    public void markAiSummaryGenerated(String summary, Instant generatedAt) {
        this.aiSummary = summary;
        this.aiSummaryStatus = "generated";
        this.aiSummaryGeneratedAt = generatedAt;
        this.aiSummaryError = null;
    }

    public void markAiSummaryFailed(String error, Instant generatedAt) {
        this.aiSummary = null;
        this.aiSummaryStatus = "failed";
        this.aiSummaryGeneratedAt = generatedAt;
        this.aiSummaryError = trimError(error);
    }

    public void markAiRiskGenerated(String riskAnalysis, Instant generatedAt) {
        this.aiRiskAnalysis = riskAnalysis;
        this.aiRiskStatus = "generated";
        this.aiRiskGeneratedAt = generatedAt;
        this.aiRiskError = null;
    }

    public void markAiRiskFailed(String error, Instant generatedAt) {
        this.aiRiskAnalysis = null;
        this.aiRiskStatus = "failed";
        this.aiRiskGeneratedAt = generatedAt;
        this.aiRiskError = trimError(error);
    }

    public void reroute(String internalUnit, String organization, Integer year, String tenderId) {
        this.internalUnit = internalUnit;
        this.organization = organization;
        if (year != null) {
            this.year = year;
        }
        if (tenderId != null && !tenderId.isBlank()) {
            this.tenderId = tenderId.trim();
        }
    }

    private String trimError(String error) {
        if (error == null || error.isBlank()) return null;
        return error.substring(0, Math.min(error.length(), 1000));
    }

    public Long getId() { return id; }
    public String getMessageId() { return messageId; }
    public String getSenderHash() { return senderHash; }
    public String getSource() { return source; }
    public Instant getTimestamp() { return timestamp; }
    public String getMediaId() { return mediaId; }
    public String getMimeType() { return mimeType; }
    public String getOriginalFilename() { return originalFilename; }
    public String getStoredFilename() { return storedFilename; }
    public String getCaption() { return caption; }
    public String getChecksum() { return checksum; }
    public String getFilePath() { return filePath; }
    public Long getFileSize() { return fileSize; }
    public String getInternalUnit() { return internalUnit; }
    public String getOrganization() { return organization; }
    public Integer getYear() { return year; }
    public String getTenderId() { return tenderId; }
    public String getDocumentType() { return documentType; }
    public String getStatus() { return status; }
    public String getErrorMessage() { return errorMessage; }
    public String getExtractedText() { return extractedText; }
    public String getTextExtractionStatus() { return textExtractionStatus; }
    public Instant getTextExtractedAt() { return textExtractedAt; }
    public String getTextExtractionError() { return textExtractionError; }
    public String getExtractedFacts() { return extractedFacts; }
    public String getFactExtractionStatus() { return factExtractionStatus; }
    public Instant getFactExtractedAt() { return factExtractedAt; }
    public String getFactExtractionError() { return factExtractionError; }
    public String getAiSummary() { return aiSummary; }
    public String getAiSummaryStatus() { return aiSummaryStatus; }
    public Instant getAiSummaryGeneratedAt() { return aiSummaryGeneratedAt; }
    public String getAiSummaryError() { return aiSummaryError; }
    public String getAiRiskAnalysis() { return aiRiskAnalysis; }
    public String getAiRiskStatus() { return aiRiskStatus; }
    public Instant getAiRiskGeneratedAt() { return aiRiskGeneratedAt; }
    public String getAiRiskError() { return aiRiskError; }
    public Instant getCreatedAt() { return createdAt; }
}
