package com.docsbot.ops.tender;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.tender.domain.TenderDocument;
import tools.jackson.databind.ObjectMapper;

@Component
public class TenderVaultWriter {

    private static final String DOCUMENTS_START = "<!-- AUTO:DOCUMENTS:START -->";
    private static final String DOCUMENTS_END = "<!-- AUTO:DOCUMENTS:END -->";
    private static final Pattern MANAGED_BLOCK = Pattern.compile(
            Pattern.quote(DOCUMENTS_START) + ".*?" + Pattern.quote(DOCUMENTS_END),
            Pattern.DOTALL);

    private static final String EXTRACTION_START = "<!-- AUTO:EXTRACTION:START -->";
    private static final String EXTRACTION_END = "<!-- AUTO:EXTRACTION:END -->";
    private static final Pattern EXTRACTION_BLOCK = Pattern.compile(
            Pattern.quote(EXTRACTION_START) + ".*?" + Pattern.quote(EXTRACTION_END),
            Pattern.DOTALL);

    private final Path vaultRoot;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenderVaultWriter(DocsBotProperties properties) {
        this.vaultRoot = Path.of(properties.vaultDir()).toAbsolutePath().normalize();
    }

    public void writeDocument(TenderDocument document) {
        Path tenderDirectory = tenderDirectory(document);
        Path documentsDirectory = tenderDirectory.resolve("documents").normalize();
        Path tenderNote = tenderDirectory.resolve(document.getTenderId() + ".md").normalize();
        Path documentNote = documentsDirectory.resolve(documentSlug(document) + ".md").normalize();
        try {
            Files.createDirectories(documentsDirectory);
            if (!Files.exists(tenderNote)) {
                Files.writeString(
                        tenderNote,
                        tenderTemplate(document),
                        StandardCharsets.UTF_8);
            }
            Files.writeString(
                    documentNote,
                    documentTemplate(document),
                    StandardCharsets.UTF_8);
            updateDocumentList(tenderNote, documentsDirectory);
        } catch (IOException exception) {
            throw new IllegalStateException("Obsidian notes could not be updated", exception);
        }
    }

    /**
     * Renders deterministic facts/summary/risk (see TenderFactExtractionService,
     * TenderSummaryService, TenderRiskAnalysisService) into the document's note, between
     * managed markers so re-running extraction just refreshes this one block. No-op if the
     * note doesn't exist yet (writeDocument always runs first, at ingestion).
     */
    public void writeExtractionResults(TenderDocument document) {
        Path documentNote = documentNotePath(document);
        if (!Files.exists(documentNote)) {
            return;
        }
        try {
            String current = Files.readString(documentNote, StandardCharsets.UTF_8);
            String block = EXTRACTION_START + "\n\n" + extractionMarkdown(document) + "\n\n" + EXTRACTION_END;
            Matcher matcher = EXTRACTION_BLOCK.matcher(current);
            String updated = matcher.find()
                    ? matcher.replaceFirst(Matcher.quoteReplacement(block))
                    : current.stripTrailing() + "\n\n" + block;
            Files.writeString(
                    documentNote,
                    updated.stripTrailing() + "\n",
                    StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("Obsidian extraction notes could not be updated", exception);
        }
    }

    private String extractionMarkdown(TenderDocument document) {
        Map<String, Object> facts = parseJsonObject(document.getExtractedFacts());
        Map<String, Object> summary = parseJsonObject(document.getAiSummary());
        Map<String, Object> risk = parseJsonObject(document.getAiRiskAnalysis());
        StringBuilder markdown = new StringBuilder();

        if (summary != null) {
            markdown.append("## Özet\n\n");
            markdown.append(str(summary.get("headline"))).append("\n\n");
            markdown.append(str(summary.get("overview"))).append("\n\n");
            List<?> keyPoints = listOf(summary.get("key_points"));
            if (!keyPoints.isEmpty()) {
                markdown.append("**Önemli noktalar:**\n");
                for (Object point : keyPoints) markdown.append("- ").append(point).append('\n');
                markdown.append('\n');
            }
        }

        if (risk != null) {
            markdown.append("## Risk Analizi — seviye: %s (skor %s)\n\n".formatted(
                    str(risk.get("risk_level")), str(risk.get("risk_score"))));
            for (Object entry : listOf(risk.get("risks"))) {
                if (entry instanceof Map<?, ?> item) {
                    markdown.append("- **[%s] %s**\n".formatted(str(item.get("severity")), str(item.get("title"))));
                    markdown.append("  - Kanıt: ").append(str(item.get("evidence"))).append('\n');
                    markdown.append("  - Öneri: ").append(str(item.get("recommendation"))).append('\n');
                }
            }
            markdown.append('\n');
        }

        if (facts != null) {
            markdown.append("## Çıkarılan Bilgiler\n\n");
            List<?> deadlines = listOf(facts.get("deadline_candidates"));
            if (!deadlines.isEmpty()) {
                markdown.append("- Olası son tarihler: ").append(deadlines.stream()
                        .map(item -> item instanceof Map<?, ?> map ? str(map.get("normalized")) : str(item))
                        .collect(Collectors.joining(", "))).append('\n');
            }
            List<?> amounts = listOf(facts.get("money_amounts"));
            if (!amounts.isEmpty()) {
                markdown.append("- Tutarlar: ").append(amounts.stream()
                        .map(item -> item instanceof Map<?, ?> map ? str(map.get("amount")) + " " + str(map.get("currency")) : str(item))
                        .collect(Collectors.joining(", "))).append('\n');
            }
            List<?> emails = listOf(facts.get("emails"));
            if (!emails.isEmpty()) {
                markdown.append("- E-postalar: ").append(emails.stream().map(this::str).collect(Collectors.joining(", "))).append('\n');
            }
        }

        return markdown.isEmpty() ? "*Henüz AI çıkarımı yapılmadı.*" : markdown.toString().stripTrailing();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return (Map<String, Object>) objectMapper.readValue(json, Map.class);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private List<?> listOf(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Path tenderDirectory(TenderDocument document) {
        return resolveInsideVault(
                "ihaleler",
                document.getYear().toString(),
                vaultSegment(document.getInternalUnit()),
                vaultSegment(document.getOrganization()),
                document.getTenderId());
    }

    private Path documentNotePath(TenderDocument document) {
        return tenderDirectory(document)
                .resolve("documents")
                .resolve(documentSlug(document) + ".md")
                .normalize();
    }

    private void updateDocumentList(Path tenderNote, Path documentsDirectory) throws IOException {
        String current = Files.readString(tenderNote, StandardCharsets.UTF_8);
        String block;
        try (Stream<Path> notes = Files.list(documentsDirectory)) {
            String links = notes
                    .filter(path -> path.getFileName().toString().endsWith(".md"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .map(path -> path.getFileName().toString().replaceFirst("\\.md$", ""))
                    .map(name -> "- [[documents/" + name + "|" + name + "]]")
                    .reduce("", (left, right) -> left + right + "\n");
            block = DOCUMENTS_START + "\n" + links + DOCUMENTS_END;
        }
        Matcher matcher = MANAGED_BLOCK.matcher(current);
        String updated = matcher.find()
                ? matcher.replaceFirst(Matcher.quoteReplacement(block))
                : current.stripTrailing() + "\n\n" + block;
        Files.writeString(
                tenderNote,
                updated.stripTrailing() + "\n",
                StandardCharsets.UTF_8);
    }

    private String tenderTemplate(TenderDocument document) {
        return """
                ---
                tender_id: %s
                year: %d
                internal_unit: %s
                organization: %s
                source: %s
                tags: [tender, %s, %s]
                ---

                # %s

                %s
                %s
                """.formatted(
                document.getTenderId(),
                document.getYear(),
                document.getInternalUnit(),
                document.getOrganization(),
                document.getSource(),
                tagSlug(document.getInternalUnit()),
                tagSlug(document.getOrganization()),
                document.getTenderId(),
                DOCUMENTS_START,
                DOCUMENTS_END);
    }

    private String documentTemplate(TenderDocument document) {
        String caption = document.getCaption() == null
                ? ""
                : document.getCaption().replace('\n', ' ');
        return """
                ---
                document_id: %d
                message_id: %s
                tender_id: %s
                year: %d
                internal_unit: %s
                organization: %s
                document_type: %s
                mime_type: %s
                checksum: %s
                status: %s
                tags: [document, %s, %s, %s]
                ---

                # %s

                Tender: [[%s]]

                - Source: %s
                - Timestamp: %s
                - Stored filename: `%s`
                - File: `%s`
                - Caption: %s
                """.formatted(
                document.getId(),
                document.getMessageId(),
                document.getTenderId(),
                document.getYear(),
                document.getInternalUnit(),
                document.getOrganization(),
                document.getDocumentType(),
                document.getMimeType(),
                document.getChecksum(),
                document.getStatus(),
                tagSlug(document.getDocumentType()),
                tagSlug(document.getInternalUnit()),
                tagSlug(document.getOrganization()),
                document.getOriginalFilename(),
                document.getTenderId(),
                document.getSource(),
                document.getTimestamp(),
                document.getStoredFilename(),
                document.getFilePath(),
                caption);
    }

    private String documentSlug(TenderDocument document) {
        String filename = document.getStoredFilename() == null
                ? document.getOriginalFilename()
                : document.getStoredFilename();
        String stem = filename == null
                ? "document"
                : filename.replaceFirst("\\.[^.]+$", "");
        String ascii = Normalizer.normalize(stem, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String slug = ascii.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9._-]+", "-")
                .replaceAll("^[._-]+|[._-]+$", "");
        if (slug.isBlank()) slug = "document";
        return slug + "-" + document.getChecksum().substring(0, 10);
    }

    /**
     * Canonical directory segment for internal-unit and organization levels: Turkish
     * characters are transliterated so `BEDAŞ` and `BEDAS` land in the same directory.
     */
    static String vaultSegment(String value) {
        if (value == null || value.isBlank()) {
            return "UNCLASSIFIED";
        }
        String ascii = Normalizer.normalize(mapTurkish(value.trim()), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String segment = ascii.toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        return segment.isBlank() ? "UNCLASSIFIED" : segment;
    }

    static String tagSlug(String value) {
        return vaultSegment(value).toLowerCase(Locale.ROOT);
    }

    private static String mapTurkish(String value) {
        return value
                .replace('ı', 'i').replace('İ', 'I')
                .replace('ş', 's').replace('Ş', 'S')
                .replace('ğ', 'g').replace('Ğ', 'G')
                .replace('ü', 'u').replace('Ü', 'U')
                .replace('ö', 'o').replace('Ö', 'O')
                .replace('ç', 'c').replace('Ç', 'C');
    }

    private Path resolveInsideVault(String first, String... more) {
        Path resolved = vaultRoot.resolve(Path.of(first, more)).normalize();
        if (!resolved.startsWith(vaultRoot)) {
            throw new IllegalArgumentException("Invalid vault path");
        }
        return resolved;
    }
}
