package com.docsbot.ops.dashboard;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class DashboardFileService {

    private static final int MAX_DEPTH = 5;
    private static final int MAX_CHILDREN = 200;
    private static final DateTimeFormatter ISO_TIME =
            DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneOffset.UTC);

    private final Path dataRoot;
    private final Path vaultRoot;
    private final TenderDocumentRepository documentRepository;

    public DashboardFileService(
            DocsBotProperties properties,
            TenderDocumentRepository documentRepository
    ) {
        this.dataRoot = Path.of(properties.dataDir()).toAbsolutePath().normalize();
        this.vaultRoot = Path.of(properties.vaultDir()).toAbsolutePath().normalize();
        this.documentRepository = documentRepository;
    }

    public DashboardDtos.TreeResponse tree() {
        return new DashboardDtos.TreeResponse(
                treeNode(dataRoot.resolve("originals"), dataRoot, "data", 0),
                treeNode(vaultRoot.resolve("ihaleler"), vaultRoot, "vault", 0));
    }

    public DashboardDtos.VaultNotesResponse vaultNotes() {
        Path notesRoot = vaultRoot.resolve("ihaleler").normalize();
        List<DashboardDtos.VaultNote> notes = new ArrayList<>();
        if (Files.isDirectory(notesRoot)) {
            try (var paths = Files.walk(notesRoot)) {
                paths.filter(path -> Files.isRegularFile(path)
                                && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
                        .sorted(Comparator.comparing(path -> path.toString().toLowerCase(Locale.ROOT)))
                        .forEach(path -> notes.add(toVaultNote(notesRoot, path)));
            } catch (IOException exception) {
                throw new IllegalStateException("Vault notes could not be listed", exception);
            }
        }
        return new DashboardDtos.VaultNotesResponse("vault/ihaleler", notes);
    }

    public DashboardDtos.VaultNoteContent vaultNote(String relativePath) {
        Path notesRoot = vaultRoot.resolve("ihaleler").normalize();
        Path target = resolveInside(notesRoot, relativePath);
        if (!Files.isRegularFile(target)
                || !target.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md")) {
            throw new ErpExceptions.NotFound("Vault note not found");
        }
        try {
            return new DashboardDtos.VaultNoteContent(
                    notesRoot.relativize(target).toString().replace('\\', '/'),
                    Files.readString(target, StandardCharsets.UTF_8));
        } catch (IOException exception) {
            throw new IllegalStateException("Vault note could not be read", exception);
        }
    }

    public StoredFile documentFile(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        if (document.getFilePath() == null || document.getFilePath().isBlank()) {
            throw new ErpExceptions.NotFound("Stored file is missing");
        }
        Path path = resolveLegacyDocumentPath(document.getFilePath());
        return storedFile(
                path,
                document.getMimeType(),
                document.getStoredFilename() != null
                        ? document.getStoredFilename()
                        : document.getOriginalFilename());
    }

    public StoredFile treeFile(String rootKey, String relativePath) {
        Path root = switch (rootKey) {
            case "data" -> dataRoot;
            case "vault" -> vaultRoot;
            default -> throw new ErpExceptions.NotFound("Unknown file root");
        };
        return storedFile(resolveInside(root, relativePath), null, null);
    }

    private DashboardDtos.TreeNode treeNode(Path path, Path base, String rootKey, int depth) {
        if (!Files.exists(path)) {
            return new DashboardDtos.TreeNode(
                    path.getFileName().toString(),
                    relativeOrName(path, base),
                    "missing",
                    null,
                    null,
                    null,
                    List.of());
        }
        if (Files.isRegularFile(path)) {
            String relative = base.relativize(path).toString().replace('\\', '/');
            String encoded = URLEncoder.encode(relative, StandardCharsets.UTF_8);
            return new DashboardDtos.TreeNode(
                    path.getFileName().toString(),
                    relative,
                    "file",
                    fileSize(path),
                    "/dashboard/tree-file?root_key=" + rootKey + "&path=" + encoded + "&download=true",
                    "/dashboard/tree-file?root_key=" + rootKey + "&path=" + encoded,
                    List.of());
        }
        if (depth >= MAX_DEPTH) {
            return new DashboardDtos.TreeNode(
                    path.getFileName().toString(),
                    relativeOrName(path, base),
                    "folder",
                    null,
                    null,
                    null,
                    List.of());
        }
        try (var children = Files.list(path)) {
            List<Path> sorted = children
                    .sorted(Comparator
                            .comparing((Path item) -> Files.isRegularFile(item))
                            .thenComparing(item -> item.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .limit(MAX_CHILDREN)
                    .toList();
            return new DashboardDtos.TreeNode(
                    path.getFileName().toString(),
                    relativeOrName(path, base),
                    "folder",
                    null,
                    null,
                    null,
                    sorted.stream()
                            .map(child -> treeNode(child, base, rootKey, depth + 1))
                            .toList());
        } catch (IOException exception) {
            throw new IllegalStateException("Folder tree could not be read", exception);
        }
    }

    private DashboardDtos.VaultNote toVaultNote(Path root, Path path) {
        try {
            String content = Files.readString(path, StandardCharsets.UTF_8);
            String relative = root.relativize(path).toString().replace('\\', '/');
            return new DashboardDtos.VaultNote(
                    stripExtension(path.getFileName().toString()),
                    relative,
                    ISO_TIME.format(Files.getLastModifiedTime(path).toInstant()),
                    countOccurrences(content, "[["),
                    noteTags(content, relative));
        } catch (IOException exception) {
            throw new IllegalStateException("Vault note could not be read", exception);
        }
    }

    private Path resolveLegacyDocumentPath(String storedPath) {
        Path raw = Path.of(storedPath);
        List<Path> candidates = raw.isAbsolute()
                ? List.of(raw.normalize())
                : List.of(dataRoot.resolve(raw).normalize(), dataRoot.getParent().resolve(raw).normalize());
        return candidates.stream()
                .filter(path -> path.startsWith(dataRoot) && Files.isRegularFile(path))
                .findFirst()
                .orElseThrow(() -> new ErpExceptions.NotFound("Stored file is missing"));
    }

    private Path resolveInside(Path root, String relativePath) {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        Path target = normalizedRoot.resolve(relativePath).normalize();
        if (!target.startsWith(normalizedRoot)) {
            throw new ErpExceptions.NotFound("File not found");
        }
        return target;
    }

    private StoredFile storedFile(Path path, String preferredContentType, String preferredFilename) {
        if (!Files.isRegularFile(path)) {
            throw new ErpExceptions.NotFound("File not found");
        }
        try {
            String detected = preferredContentType;
            if (detected == null || detected.isBlank()) {
                detected = Files.probeContentType(path);
            }
            return new StoredFile(
                    path,
                    detected == null ? "application/octet-stream" : detected,
                    preferredFilename == null || preferredFilename.isBlank()
                            ? path.getFileName().toString()
                            : safeResponseFilename(preferredFilename));
        } catch (IOException exception) {
            throw new IllegalStateException("File metadata could not be read", exception);
        }
    }

    private String safeResponseFilename(String value) {
        String normalized = value.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\r\\n\\u0000-\\u001f]", "_")
                .trim();
        return name.isBlank() ? "document" : name;
    }

    private List<String> noteTags(String content, String relativePath) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        for (String part : relativePath.replace(".md", "").split("/")) {
            String cleaned = part.trim().toLowerCase(Locale.ROOT).replace(' ', '-');
            if (!cleaned.isBlank()) tags.add(cleaned);
            if (tags.size() >= 4) return List.copyOf(tags);
        }
        content.lines().filter(line -> line.startsWith("tags:")).findFirst().ifPresent(line -> {
            for (String part : line.substring(5).replace("[", "").replace("]", "").split(",")) {
                String cleaned = part.trim().replace("\"", "").replace("'", "");
                if (!cleaned.isBlank()) tags.add(cleaned);
                if (tags.size() >= 4) break;
            }
        });
        return List.copyOf(tags);
    }

    private long countOccurrences(String value, String needle) {
        long count = 0;
        int offset = 0;
        while ((offset = value.indexOf(needle, offset)) >= 0) {
            count++;
            offset += needle.length();
        }
        return count;
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private String relativeOrName(Path path, Path base) {
        return path.startsWith(base)
                ? base.relativize(path).toString().replace('\\', '/')
                : path.getFileName().toString();
    }

    private Long fileSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException exception) {
            return null;
        }
    }

    public record StoredFile(Path path, String contentType, String filename) {
    }
}
