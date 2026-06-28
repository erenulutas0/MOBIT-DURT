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
                document.getInternalUnit(),
                document.getOrganization(),
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
                document_type: %s
                mime_type: %s
                checksum: %s
                status: %s
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
                document.getDocumentType(),
                document.getMimeType(),
                document.getChecksum(),
                document.getStatus(),
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

    private Path resolveInsideVault(String first, String... more) {
        Path resolved = vaultRoot.resolve(Path.of(first, more)).normalize();
        if (!resolved.startsWith(vaultRoot)) {
            throw new IllegalArgumentException("Invalid vault path");
        }
        return resolved;
    }
}
