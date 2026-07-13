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
public class TenderRiskAnalysisService {

    private final TenderDocumentRepository documentRepository;
    private final TenderFactExtractionService factExtractionService;
    private final TenderMissingDocumentService missingDocumentService;
    private final TenderVaultWriter vaultWriter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenderRiskAnalysisService(
            TenderDocumentRepository documentRepository,
            TenderFactExtractionService factExtractionService,
            TenderMissingDocumentService missingDocumentService,
            TenderVaultWriter vaultWriter
    ) {
        this.documentRepository = documentRepository;
        this.factExtractionService = factExtractionService;
        this.missingDocumentService = missingDocumentService;
        this.vaultWriter = vaultWriter;
    }

    @Transactional
    public TenderDocument analyzeRisks(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        if (!"extracted".equals(document.getFactExtractionStatus())) {
            document = factExtractionService.extractFacts(documentId);
        }
        try {
            Map<String, Object> risk = riskFor(document, factExtractionService.factsFor(document));
            document.markAiRiskGenerated(objectMapper.writeValueAsString(risk), Instant.now());
        } catch (Exception exception) {
            document.markAiRiskFailed(exception.getMessage(), Instant.now());
        }
        TenderDocument saved = documentRepository.saveAndFlush(document);
        vaultWriter.writeExtractionResults(saved);
        return saved;
    }

    private Map<String, Object> riskFor(
            TenderDocument document,
            Map<String, Object> facts
    ) {
        List<Map<String, Object>> risks = new ArrayList<>();
        TenderDtos.MissingDocumentsResponse missing =
                missingDocumentService.detectMissingDocuments(document.getTenderId());
        if (!missing.missingTypes().isEmpty()) {
            risks.add(risk(
                    "missing_documents",
                    missing.missingTypes().contains("administrative_spec") ? "high" : "medium",
                    "Eksik ihale belgeleri var",
                    "Eksik tipler: " + String.join(", ", missing.missingTypes()),
                    "Eksik belgeler tamamlanmadan teklif/onay akışını başlatmayın."));
        }
        if (nonEmptyList(facts.get("deadline_candidates"))) {
            risks.add(risk(
                    "deadline",
                    "medium",
                    "Son tarih adayı tespit edildi",
                    "Belgedeki tarih bağlamı deadline olabilir.",
                    "ERP görev deadline'ını bu tarihe göre doğrulayın."));
        } else {
            risks.add(risk(
                    "deadline",
                    "medium",
                    "Belgede açık son tarih bulunamadı",
                    "Fact extractor deadline adayı yakalayamadı.",
                    "İhale takvimini manuel kontrol edin."));
        }
        if (nonEmptyList(facts.get("money_amounts"))) {
            risks.add(risk(
                    "financial",
                    "medium",
                    "Tutar/teminat bilgisi var",
                    "Belgede TL/TRY tutarı tespit edildi.",
                    "Finansal tutarları teklif ve teminat ekibiyle doğrulayın."));
        }
        String corpus = (
                nullToBlank(document.getOriginalFilename()) + " "
                        + nullToBlank(document.getCaption()) + " "
                        + nullToBlank(document.getExtractedText()))
                .toLowerCase(Locale.ROOT);
        if (corpus.contains("teminat") && missing.missingTypes().contains("guarantee")) {
            risks.add(risk(
                    "guarantee",
                    "high",
                    "Teminat ifadesi var ama teminat belgesi eksik",
                    "Belge metninde teminat geçiyor, required set içinde guarantee eksik.",
                    "Teminat mektubu/garanti belgesini ihale klasörüne ekleyin."));
        }
        if ("unknown".equals(document.getDocumentType())) {
            risks.add(risk(
                    "classification",
                    "low",
                    "Belge tipi sınıflandırılamadı",
                    "Kural tabanlı sınıflandırıcı bu dosyayı unknown işaretledi.",
                    "Dosya adını/metadata'yı kontrol edip belge tipini netleştirin."));
        }
        int score = risks.stream()
                .mapToInt(item -> severityScore((String) item.get("severity")))
                .sum();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("provider", "deterministic-risk-v1");
        response.put("tender_id", document.getTenderId());
        response.put("document_id", document.getId());
        response.put("risk_score", Math.min(score, 100));
        response.put("risk_level", riskLevel(score));
        response.put("risks", risks);
        return response;
    }

    private Map<String, Object> risk(
            String category,
            String severity,
            String title,
            String evidence,
            String recommendation
    ) {
        Map<String, Object> risk = new LinkedHashMap<>();
        risk.put("category", category);
        risk.put("severity", severity);
        risk.put("title", title);
        risk.put("evidence", evidence);
        risk.put("recommendation", recommendation);
        return risk;
    }

    private int severityScore(String severity) {
        return switch (severity) {
            case "high" -> 40;
            case "medium" -> 20;
            default -> 5;
        };
    }

    private String riskLevel(int score) {
        if (score >= 60) return "high";
        if (score >= 25) return "medium";
        return "low";
    }

    private boolean nonEmptyList(Object value) {
        return value instanceof List<?> list && !list.isEmpty();
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }
}
