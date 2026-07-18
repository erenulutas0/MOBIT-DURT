package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.List;

import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.DocumentShareLink;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

public final class TenderDtos {
    private TenderDtos() {
    }

    public record DocumentResponse(
            Long id,
            @JsonProperty("message_id") String messageId,
            @JsonProperty("sender_hash") String senderHash,
            String source,
            Instant timestamp,
            @JsonProperty("media_id") String mediaId,
            @JsonProperty("mime_type") String mimeType,
            @JsonProperty("original_filename") String originalFilename,
            @JsonProperty("stored_filename") String storedFilename,
            String caption,
            String checksum,
            @JsonProperty("file_path") String filePath,
            @JsonProperty("file_size") Long fileSize,
            @JsonProperty("internal_unit") String internalUnit,
            String organization,
            Integer year,
            @JsonProperty("tender_id") String tenderId,
            @JsonProperty("document_type") String documentType,
            String status,
            @JsonProperty("error_message") String errorMessage,
            @JsonProperty("text_extraction_status") String textExtractionStatus,
            @JsonProperty("text_extracted_at") Instant textExtractedAt,
            @JsonProperty("text_extraction_error") String textExtractionError,
            @JsonProperty("extracted_text_length") Integer extractedTextLength,
            @JsonProperty("fact_extraction_status") String factExtractionStatus,
            @JsonProperty("fact_extracted_at") Instant factExtractedAt,
            @JsonProperty("fact_extraction_error") String factExtractionError,
            @JsonProperty("ai_summary_status") String aiSummaryStatus,
            @JsonProperty("ai_summary_generated_at") Instant aiSummaryGeneratedAt,
            @JsonProperty("ai_summary_error") String aiSummaryError,
            @JsonProperty("ai_risk_status") String aiRiskStatus,
            @JsonProperty("ai_risk_generated_at") Instant aiRiskGeneratedAt,
            @JsonProperty("ai_risk_error") String aiRiskError
    ) {
        static DocumentResponse from(TenderDocument value) {
            return new DocumentResponse(
                    value.getId(), value.getMessageId(), value.getSenderHash(),
                    value.getSource(), value.getTimestamp(), value.getMediaId(),
                    value.getMimeType(), value.getOriginalFilename(), value.getStoredFilename(),
                    value.getCaption(), value.getChecksum(), value.getFilePath(),
                    value.getFileSize(), value.getInternalUnit(), value.getOrganization(),
                    value.getYear(), value.getTenderId(), value.getDocumentType(),
                    value.getStatus(), value.getErrorMessage(),
                    value.getTextExtractionStatus(), value.getTextExtractedAt(),
                    value.getTextExtractionError(),
                    value.getExtractedText() == null ? null : value.getExtractedText().length(),
                    value.getFactExtractionStatus(), value.getFactExtractedAt(),
                    value.getFactExtractionError(),
                    value.getAiSummaryStatus(), value.getAiSummaryGeneratedAt(),
                    value.getAiSummaryError(),
                    value.getAiRiskStatus(), value.getAiRiskGeneratedAt(),
                    value.getAiRiskError());
        }
    }

    public record PageMeta(
            long total,
            int offset,
            int limit,
            @JsonProperty("has_next") boolean hasNext
    ) {
        public static PageMeta of(long total, int offset, int limit) {
            return new PageMeta(total, offset, limit, offset + limit < total);
        }
    }

    public record DocumentPageResponse(
            PageMeta page,
            List<DocumentResponse> items
    ) {
    }

    public record DocumentWorkspaceResponse(
            DocumentResponse document,
            boolean favorite,
            @JsonProperty("favorited_at") Instant favoritedAt,
            @JsonProperty("last_accessed_at") Instant lastAccessedAt,
            @JsonProperty("access_count") long accessCount
    ) {
        public static DocumentWorkspaceResponse from(DocumentWorkspaceService.DocumentWorkspaceItem item) {
            return new DocumentWorkspaceResponse(
                    DocumentResponse.from(item.document()),
                    item.state().isFavorite(),
                    item.state().getFavoritedAt(),
                    item.state().getLastAccessedAt(),
                    item.state().getAccessCount());
        }
    }

    public record DocumentShareLinkResponse(
            Long id,
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("created_by") String createdBy,
            @JsonProperty("expires_at") Instant expiresAt,
            @JsonProperty("revoked_at") Instant revokedAt,
            @JsonProperty("last_accessed_at") Instant lastAccessedAt,
            @JsonProperty("access_count") long accessCount,
            @JsonProperty("created_at") Instant createdAt,
            boolean active
    ) {
        public static DocumentShareLinkResponse from(DocumentShareLink link, Instant now) {
            return new DocumentShareLinkResponse(
                    link.getId(),
                    link.getDocumentId(),
                    link.getCreatedBy(),
                    link.getExpiresAt(),
                    link.getRevokedAt(),
                    link.getLastAccessedAt(),
                    link.getAccessCount(),
                    link.getCreatedAt(),
                    link.activeAt(now));
        }
    }

    public record CreatedDocumentShareLinkResponse(
            DocumentShareLinkResponse share,
            @JsonProperty("access_url") String accessUrl
    ) {
    }

    public record TenderPageResponse(
            PageMeta page,
            List<TenderResponse> items
    ) {
    }

    public record DocumentTextResponse(
            Long id,
            @JsonProperty("text_extraction_status") String textExtractionStatus,
            @JsonProperty("text_extracted_at") Instant textExtractedAt,
            @JsonProperty("text_extraction_error") String textExtractionError,
            @JsonProperty("extracted_text") String extractedText
    ) {
        static DocumentTextResponse from(TenderDocument value) {
            return new DocumentTextResponse(
                    value.getId(),
                    value.getTextExtractionStatus(),
                    value.getTextExtractedAt(),
                    value.getTextExtractionError(),
                    value.getExtractedText());
        }
    }

    public record DocumentSearchResponse(
            int total,
            List<DocumentSearchResult> results
    ) {
    }

    public record DocumentSearchResult(
            Long id,
            @JsonProperty("tender_id") String tenderId,
            @JsonProperty("original_filename") String originalFilename,
            @JsonProperty("document_type") String documentType,
            String organization,
            @JsonProperty("internal_unit") String internalUnit,
            Integer year,
            String source,
            Instant timestamp,
            @JsonProperty("text_extraction_status") String textExtractionStatus,
            double rank,
            String snippet
    ) {
    }

    public record DocumentFacetsResponse(
            List<FacetValue> organizations,
            List<FacetValue> years,
            @JsonProperty("internal_units") List<FacetValue> internalUnits,
            @JsonProperty("document_types") List<FacetValue> documentTypes,
            List<FacetValue> statuses,
            @JsonProperty("timestamp_min") Instant timestampMin,
            @JsonProperty("timestamp_max") Instant timestampMax
    ) {
    }

    public record FacetValue(
            String value,
            long count
    ) {
    }

    public record DocumentFactsResponse(
            Long id,
            @JsonProperty("fact_extraction_status") String factExtractionStatus,
            @JsonProperty("fact_extracted_at") Instant factExtractedAt,
            @JsonProperty("fact_extraction_error") String factExtractionError,
            JsonNode facts
    ) {
        static DocumentFactsResponse from(TenderDocument value, ObjectMapper objectMapper) {
            return new DocumentFactsResponse(
                    value.getId(),
                    value.getFactExtractionStatus(),
                    value.getFactExtractedAt(),
                    value.getFactExtractionError(),
                    parseFacts(value.getExtractedFacts(), objectMapper));
        }

        private static JsonNode parseFacts(String value, ObjectMapper objectMapper) {
            if (value == null || value.isBlank()) return objectMapper.createObjectNode();
            try {
                return objectMapper.readTree(value);
            } catch (Exception exception) {
                ObjectNode fallback = objectMapper.createObjectNode();
                fallback.put("parse_error", "Stored facts could not be parsed");
                return fallback;
            }
        }
    }

    public record DocumentSummaryResponse(
            Long id,
            @JsonProperty("ai_summary_status") String aiSummaryStatus,
            @JsonProperty("ai_summary_generated_at") Instant aiSummaryGeneratedAt,
            @JsonProperty("ai_summary_error") String aiSummaryError,
            JsonNode summary
    ) {
        static DocumentSummaryResponse from(TenderDocument value, ObjectMapper objectMapper) {
            return new DocumentSummaryResponse(
                    value.getId(),
                    value.getAiSummaryStatus(),
                    value.getAiSummaryGeneratedAt(),
                    value.getAiSummaryError(),
                    parseSummary(value.getAiSummary(), objectMapper));
        }

        private static JsonNode parseSummary(String value, ObjectMapper objectMapper) {
            if (value == null || value.isBlank()) return objectMapper.createObjectNode();
            try {
                return objectMapper.readTree(value);
            } catch (Exception exception) {
                ObjectNode fallback = objectMapper.createObjectNode();
                fallback.put("parse_error", "Stored summary could not be parsed");
                return fallback;
            }
        }
    }

    public record DocumentRiskResponse(
            Long id,
            @JsonProperty("ai_risk_status") String aiRiskStatus,
            @JsonProperty("ai_risk_generated_at") Instant aiRiskGeneratedAt,
            @JsonProperty("ai_risk_error") String aiRiskError,
            @JsonProperty("risk_analysis") JsonNode riskAnalysis
    ) {
        static DocumentRiskResponse from(TenderDocument value, ObjectMapper objectMapper) {
            return new DocumentRiskResponse(
                    value.getId(),
                    value.getAiRiskStatus(),
                    value.getAiRiskGeneratedAt(),
                    value.getAiRiskError(),
                    parseRisk(value.getAiRiskAnalysis(), objectMapper));
        }

        private static JsonNode parseRisk(String value, ObjectMapper objectMapper) {
            if (value == null || value.isBlank()) return objectMapper.createObjectNode();
            try {
                return objectMapper.readTree(value);
            } catch (Exception exception) {
                ObjectNode fallback = objectMapper.createObjectNode();
                fallback.put("parse_error", "Stored risk analysis could not be parsed");
                return fallback;
            }
        }
    }

    public record TenderResponse(
            Long id,
            @JsonProperty("tender_id") String tenderId,
            String organization,
            Integer year,
            Integer sequence,
            @JsonProperty("internal_unit") String internalUnit,
            String title,
            String status,
            @JsonProperty("created_at") Instant createdAt,
            @JsonProperty("submission_deadline_at") Instant submissionDeadlineAt
    ) {
        static TenderResponse from(Tender value) {
            return new TenderResponse(
                    value.getId(), value.getTenderId(), value.getOrganization(),
                    value.getYear(), value.getSequence(), value.getInternalUnit(),
                    value.getTitle(), value.getStatus(), value.getCreatedAt(),
                    value.getSubmissionDeadlineAt());
        }
    }

    public record MissingDocumentsResponse(
            @JsonProperty("tender_id") String tenderId,
            @JsonProperty("required_types") List<String> requiredTypes,
            @JsonProperty("present_types") List<String> presentTypes,
            @JsonProperty("missing_types") List<String> missingTypes,
            @JsonProperty("document_count") int documentCount,
            String status,
            List<String> recommendations
    ) {
    }

    public record TaskSuggestionResponse(
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("tender_id") String tenderId,
            String title,
            String description,
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt,
            String rationale
    ) {
    }
}
