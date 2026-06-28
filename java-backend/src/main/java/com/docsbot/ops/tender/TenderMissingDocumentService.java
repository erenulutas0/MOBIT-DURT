package com.docsbot.ops.tender;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import com.docsbot.ops.tender.infrastructure.TenderRepository;

@Service
@Profile("postgres")
public class TenderMissingDocumentService {

    private static final List<String> REQUIRED_TYPES = List.of(
            "technical_spec",
            "administrative_spec",
            "proposal",
            "contract",
            "quantity_takeoff",
            "guarantee");

    private final TenderRepository tenderRepository;
    private final TenderDocumentRepository documentRepository;

    public TenderMissingDocumentService(
            TenderRepository tenderRepository,
            TenderDocumentRepository documentRepository
    ) {
        this.tenderRepository = tenderRepository;
        this.documentRepository = documentRepository;
    }

    public TenderDtos.MissingDocumentsResponse detectMissingDocuments(String tenderId) {
        tenderRepository.findByTenderId(tenderId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Tender not found"));
        List<TenderDocument> documents =
                documentRepository.findAllByTenderIdOrderByTimestampDescIdDesc(tenderId);
        Set<String> present = new LinkedHashSet<>();
        for (TenderDocument document : documents) {
            String type = document.getDocumentType();
            if (type != null && !type.isBlank() && !"unknown".equals(type)) {
                present.add(type);
            }
        }
        List<String> missing = REQUIRED_TYPES.stream()
                .filter(type -> !present.contains(type))
                .toList();
        return new TenderDtos.MissingDocumentsResponse(
                tenderId,
                REQUIRED_TYPES,
                List.copyOf(present),
                missing,
                documents.size(),
                missing.isEmpty() ? "complete" : "missing",
                recommendations(missing));
    }

    private List<String> recommendations(List<String> missing) {
        List<String> recommendations = new ArrayList<>();
        for (String type : missing) {
            recommendations.add(switch (type) {
                case "technical_spec" -> "Teknik şartname belgesini ihale klasörüne ekleyin.";
                case "administrative_spec" -> "İdari şartname belgesini kontrol edip ekleyin.";
                case "proposal" -> "Teklif/proposal belgesini talep edin veya yükleyin.";
                case "contract" -> "Sözleşme taslağı veya nihai sözleşme belgesini ekleyin.";
                case "quantity_takeoff" -> "Metraj/keşif/BOQ belgesini ekleyin.";
                case "guarantee" -> "Teminat/garanti belgesini kontrol edin.";
                default -> type + " belgesini kontrol edin.";
            });
        }
        return recommendations;
    }
}
