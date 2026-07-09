package com.docsbot.ops.tender;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.tender.domain.TenderDocument;

@Component
public class TenderVaultWriter {

    private static final String DOCUMENTS_START = "<!-- AUTO:DOCUMENTS:START -->";
    private static final String DOCUMENTS_END = "<!-- AUTO:DOCUMENTS:END -->";
    private static final Pattern MANAGED_BLOCK = Pattern.compile(
            Pattern.quote(DOCUMENTS_START) + ".*?" + Pattern.quote(DOCUMENTS_END),
            Pattern.DOTALL);

    private final Path vaultRoot;

    public TenderVaultWriter(DocsBotProperties properties) {
        this.vaultRoot = Path.of(properties.vaultDir()).toAbsolutePath().normalize();
    }

    public void writeDocument(TenderDocument document) {
        Path tenderDirectory = resolveInsideVault(
                "ihaleler",
                document.getYear().toString(),
                vaultSegment(document.getInternalUnit()),
                vaultSegment(document.getOrganization()),
                document.getTenderId());
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
