package com.docsbot.ops.tender;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class TenderTaskSuggestionService {

    private final TenderDocumentRepository documentRepository;
    private final TenderFactExtractionService factExtractionService;

    public TenderTaskSuggestionService(
            TenderDocumentRepository documentRepository,
            TenderFactExtractionService factExtractionService
    ) {
        this.documentRepository = documentRepository;
        this.factExtractionService = factExtractionService;
    }

    @Transactional
    public TenderDtos.TaskSuggestionResponse suggestTask(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        if (!"extracted".equals(document.getFactExtractionStatus())) {
            document = factExtractionService.extractFacts(documentId);
        }
        Map<String, Object> facts = factExtractionService.factsFor(document);
        Instant deadline = firstDeadline(facts);
        String priority = deadline != null || hasMoney(facts) ? "high" : "normal";
        return new TenderDtos.TaskSuggestionResponse(
                document.getId(),
                document.getTenderId(),
                title(document),
                description(document, facts),
                priority,
                deadline,
                rationale(deadline, facts));
    }

    private String title(TenderDocument document) {
        return "İncele: %s - %s".formatted(
                readableDocumentType(document.getDocumentType()),
                document.getTenderId());
    }

    private String description(TenderDocument document, Map<String, Object> facts) {
        StringBuilder description = new StringBuilder();
        description.append("Belge: ")
                .append(document.getOriginalFilename() == null ? "doküman" : document.getOriginalFilename())
                .append("\nİhale: ")
                .append(document.getTenderId());
        if (document.getOrganization() != null) {
            description.append("\nKurum: ").append(document.getOrganization());
        }
        if (nonEmptyList(facts.get("deadline_candidates"))) {
            description.append("\nDeadline adayı fact extractor tarafından bulundu.");
        }
        if (hasMoney(facts)) {
            description.append("\nTutar/teminat bilgileri finansal doğrulama gerektiriyor.");
        }
        description.append("\n\nÖnerilen işlem: Belgeyi inceleyip eksik belge, risk ve görev takibini tamamlayın.");
        return description.toString();
    }

    private String rationale(Instant deadline, Map<String, Object> facts) {
        if (deadline != null && hasMoney(facts)) {
            return "Belgede hem deadline adayı hem de finansal tutar bulunduğu için yüksek öncelikli görev önerildi.";
        }
        if (deadline != null) {
            return "Belgede deadline adayı bulunduğu için görev tarihi önerildi.";
        }
        if (hasMoney(facts)) {
            return "Belgede finansal tutar bulunduğu için yüksek öncelikli kontrol görevi önerildi.";
        }
        return "Belge metadata ve çıkarılmış metin üzerinden standart inceleme görevi önerildi.";
    }

    private Instant firstDeadline(Map<String, Object> facts) {
        Object value = facts.get("deadline_candidates");
        if (!(value instanceof List<?> list) || list.isEmpty()) return null;
        Object first = list.getFirst();
        if (!(first instanceof Map<?, ?> map)) return null;
        Object normalized = map.get("normalized");
        if (!(normalized instanceof String date) || date.isBlank()) return null;
        try {
            return LocalDate.parse(date).atTime(9, 0).toInstant(ZoneOffset.UTC);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private boolean hasMoney(Map<String, Object> facts) {
        return nonEmptyList(facts.get("money_amounts"));
    }

    private boolean nonEmptyList(Object value) {
        return value instanceof List<?> list && !list.isEmpty();
    }

    private String readableDocumentType(String value) {
        if (value == null || value.isBlank()) return "belge";
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "technical_spec" -> "teknik şartname";
            case "administrative_spec" -> "idari şartname";
            case "proposal" -> "teklif";
            case "contract" -> "sözleşme";
            case "quantity_takeoff" -> "metraj/keşif";
            case "guarantee" -> "teminat";
            default -> value.replace('_', ' ');
        };
    }
}
