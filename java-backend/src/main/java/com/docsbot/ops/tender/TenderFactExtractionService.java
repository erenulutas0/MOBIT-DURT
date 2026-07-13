package com.docsbot.ops.tender;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class TenderFactExtractionService {

    private static final Pattern DOTTED_DATE = Pattern.compile(
            "\\b(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})\\b");
    private static final Pattern ISO_DATE = Pattern.compile("\\b(20\\d{2})-(\\d{2})-(\\d{2})\\b");
    private static final Pattern MONEY = Pattern.compile(
            "(?iu)(?:₺\\s*)?(\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)\\s*(?:TL|TRY|₺)");
    private static final Pattern EMAIL = Pattern.compile(
            "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b",
            Pattern.CASE_INSENSITIVE);

    private final TenderDocumentRepository documentRepository;
    private final TenderTextExtractionService textExtractionService;
    private final TenderVaultWriter vaultWriter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenderFactExtractionService(
            TenderDocumentRepository documentRepository,
            TenderTextExtractionService textExtractionService,
            TenderVaultWriter vaultWriter
    ) {
        this.documentRepository = documentRepository;
        this.textExtractionService = textExtractionService;
        this.vaultWriter = vaultWriter;
    }

    @Transactional
    public TenderDocument extractFacts(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        if (document.getExtractedText() == null
                && "pending".equals(document.getTextExtractionStatus())) {
            document = textExtractionService.extractText(documentId);
        }
        try {
            String facts = objectMapper.writeValueAsString(factsFor(document));
            document.markFactsExtracted(facts, Instant.now());
        } catch (Exception exception) {
            document.markFactExtractionFailed(exception.getMessage(), Instant.now());
        }
        TenderDocument saved = documentRepository.saveAndFlush(document);
        vaultWriter.writeExtractionResults(saved);
        return saved;
    }

    Map<String, Object> factsFor(TenderDocument document) {
        String corpus = corpus(document);
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("metadata", metadata(document));
        facts.put("dates", dates(corpus));
        facts.put("deadline_candidates", deadlineCandidates(corpus));
        facts.put("money_amounts", moneyAmounts(corpus));
        facts.put("emails", uniqueMatches(EMAIL, corpus));
        return facts;
    }

    private Map<String, Object> metadata(TenderDocument document) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("tender_id", document.getTenderId());
        metadata.put("organization", document.getOrganization());
        metadata.put("internal_unit", document.getInternalUnit());
        metadata.put("year", document.getYear());
        metadata.put("document_type", document.getDocumentType());
        metadata.put("original_filename", document.getOriginalFilename());
        return metadata;
    }

    private List<Map<String, Object>> dates(String corpus) {
        List<Map<String, Object>> results = new ArrayList<>();
        Matcher dotted = DOTTED_DATE.matcher(corpus);
        while (dotted.find()) {
            addDate(results, dotted.group(), normalizeDate(
                    dotted.group(3),
                    dotted.group(2),
                    dotted.group(1)), snippet(corpus, dotted.start(), dotted.end()));
        }
        Matcher iso = ISO_DATE.matcher(corpus);
        while (iso.find()) {
            addDate(results, iso.group(), normalizeDate(
                    iso.group(1),
                    iso.group(2),
                    iso.group(3)), snippet(corpus, iso.start(), iso.end()));
        }
        return results;
    }

    private List<Map<String, Object>> deadlineCandidates(String corpus) {
        return dates(corpus).stream()
                .filter(item -> deadlineContext((String) item.get("context")))
                .toList();
    }

    private List<Map<String, Object>> moneyAmounts(String corpus) {
        List<Map<String, Object>> results = new ArrayList<>();
        Matcher matcher = MONEY.matcher(corpus);
        while (matcher.find()) {
            String rawAmount = matcher.group(1);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("value", matcher.group());
            item.put("amount", normalizeMoney(rawAmount));
            item.put("currency", "TRY");
            item.put("context", snippet(corpus, matcher.start(), matcher.end()));
            results.add(item);
        }
        return results;
    }

    private List<String> uniqueMatches(Pattern pattern, String corpus) {
        List<String> values = new ArrayList<>();
        Matcher matcher = pattern.matcher(corpus);
        while (matcher.find()) {
            String value = matcher.group();
            if (!values.contains(value)) values.add(value);
        }
        return values;
    }

    private void addDate(
            List<Map<String, Object>> results,
            String value,
            String normalized,
            String context
    ) {
        if (normalized == null) return;
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("value", value);
        item.put("normalized", normalized);
        item.put("context", context);
        results.add(item);
    }

    private String normalizeDate(String year, String month, String day) {
        int parsedYear = Integer.parseInt(year);
        if (parsedYear < 100) parsedYear += 2000;
        try {
            return LocalDate.of(
                    parsedYear,
                    Integer.parseInt(month),
                    Integer.parseInt(day)).toString();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private String normalizeMoney(String value) {
        String normalized = value.replace(".", "")
                .replace(" ", "")
                .replace(',', '.');
        try {
            return new BigDecimal(normalized).stripTrailingZeros().toPlainString();
        } catch (RuntimeException exception) {
            return normalized;
        }
    }

    private boolean deadlineContext(String context) {
        String normalized = context.toLowerCase(Locale.ROOT);
        return normalized.contains("son")
                || normalized.contains("deadline")
                || normalized.contains("teslim")
                || normalized.contains("teklif")
                || normalized.contains("basvuru")
                || normalized.contains("başvuru");
    }

    private String corpus(TenderDocument document) {
        return String.join("\n",
                nullToBlank(document.getOriginalFilename()),
                nullToBlank(document.getCaption()),
                nullToBlank(document.getExtractedText()));
    }

    private String snippet(String corpus, int start, int end) {
        int from = Math.max(0, start - 60);
        int to = Math.min(corpus.length(), end + 60);
        return corpus.substring(from, to)
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }
}
