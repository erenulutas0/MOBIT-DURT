package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class TenderSummaryService {

    private static final int MAX_KEY_POINTS = 5;

    private final TenderDocumentRepository documentRepository;
    private final TenderFactExtractionService factExtractionService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenderSummaryService(
            TenderDocumentRepository documentRepository,
            TenderFactExtractionService factExtractionService
    ) {
        this.documentRepository = documentRepository;
        this.factExtractionService = factExtractionService;
    }

    @Transactional
    public TenderDocument generateSummary(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        if (!"extracted".equals(document.getFactExtractionStatus())) {
            document = factExtractionService.extractFacts(documentId);
        }
        try {
            Map<String, Object> summary = summaryFor(document, factExtractionService.factsFor(document));
            document.markAiSummaryGenerated(
                    objectMapper.writeValueAsString(summary),
                    Instant.now());
        } catch (Exception exception) {
            document.markAiSummaryFailed(exception.getMessage(), Instant.now());
        }
        return documentRepository.saveAndFlush(document);
    }

    private Map<String, Object> summaryFor(
            TenderDocument document,
            Map<String, Object> facts
    ) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("provider", "deterministic-extractive-v1");
        summary.put("tender_id", document.getTenderId());
        summary.put("document_id", document.getId());
        summary.put("headline", headline(document));
        summary.put("overview", overview(document));
        summary.put("key_points", keyPoints(document));
        summary.put("important_dates", facts.getOrDefault("deadline_candidates", List.of()));
        summary.put("money_amounts", facts.getOrDefault("money_amounts", List.of()));
        summary.put("contacts", facts.getOrDefault("emails", List.of()));
        summary.put("suggested_next_actions", suggestedActions(document, facts));
        return summary;
    }

    private String headline(TenderDocument document) {
        String type = readableDocumentType(document.getDocumentType());
        String organization = document.getOrganization() == null ? "Ihale" : document.getOrganization();
        return "%s için %s özeti".formatted(organization, type);
    }

    private String overview(TenderDocument document) {
        String firstSentence = firstUsefulSentence(document.getExtractedText());
        if (!firstSentence.isBlank()) return firstSentence;
        String filename = document.getOriginalFilename() == null
                ? "belge"
                : document.getOriginalFilename();
        return "%s dosyası %s ihalesine bağlı %s dokümanı olarak kaydedildi.".formatted(
                filename,
                document.getTenderId(),
                readableDocumentType(document.getDocumentType()));
    }

    private List<String> keyPoints(TenderDocument document) {
        List<String> points = new ArrayList<>();
        points.add("İhale: " + document.getTenderId());
        if (document.getOrganization() != null) points.add("Kurum: " + document.getOrganization());
        if (document.getInternalUnit() != null) points.add("Birim: " + document.getInternalUnit());
        if (document.getOriginalFilename() != null) points.add("Kaynak dosya: " + document.getOriginalFilename());
        for (String sentence : usefulSentences(document.getExtractedText())) {
            if (points.size() >= MAX_KEY_POINTS) break;
            if (!points.contains(sentence)) points.add(sentence);
        }
        return points;
    }

    private List<String> suggestedActions(
            TenderDocument document,
            Map<String, Object> facts
    ) {
        List<String> actions = new ArrayList<>();
        actions.add("Belgeyi ilgili ihale görevine bağlayıp sorumlu kişiye inceleme atayın.");
        if (nonEmptyList(facts.get("deadline_candidates"))) {
            actions.add("Son tarih adaylarını kontrol edip ERP görev deadline'ı olarak işleyin.");
        }
        if (nonEmptyList(facts.get("money_amounts"))) {
            actions.add("Tutar ve teminat bilgilerini finans/teklif ekibiyle doğrulayın.");
        }
        if ("technical_spec".equals(document.getDocumentType())) {
            actions.add("Teknik şartname maddelerini eksik belge ve risk analizi için işaretleyin.");
        }
        return actions;
    }

    private boolean nonEmptyList(Object value) {
        return value instanceof List<?> list && !list.isEmpty();
    }

    private String firstUsefulSentence(String text) {
        return usefulSentences(text).stream().findFirst().orElse("");
    }

    private List<String> usefulSentences(String text) {
        if (text == null || text.isBlank()) return List.of();
        List<String> sentences = new ArrayList<>();
        for (String raw : text.replace('\n', ' ').split("(?<=[.!?])\\s+")) {
            String sentence = raw.replaceAll("\\s+", " ").trim();
            if (sentence.length() >= 24) {
                sentences.add(sentence.substring(0, Math.min(sentence.length(), 300)));
            }
            if (sentences.size() >= MAX_KEY_POINTS) break;
        }
        return sentences;
    }

    private String readableDocumentType(String value) {
        if (value == null || value.isBlank()) return "belge";
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "technical_spec" -> "teknik şartname";
            case "administrative_spec" -> "idari şartname";
            case "contract" -> "sözleşme";
            case "pricing" -> "fiyat/teklif";
            default -> value.replace('_', ' ');
        };
    }
}
