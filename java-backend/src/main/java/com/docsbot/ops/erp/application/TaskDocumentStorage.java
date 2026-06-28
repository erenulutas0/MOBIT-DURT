package com.docsbot.ops.erp.application;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.common.config.DocsBotProperties;

@Component
public class TaskDocumentStorage {

    private static final Pattern UNSAFE_FILENAME = Pattern.compile("[^a-zA-Z0-9._-]+");
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
            "image/jpeg",
            "image/png",
            "image/webp");
    private static final Map<String, Set<String>> MIME_EXTENSIONS = Map.ofEntries(
            Map.entry("application/pdf", Set.of("pdf")),
            Map.entry("application/msword", Set.of("doc")),
            Map.entry(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    Set.of("docx")),
            Map.entry("application/vnd.ms-excel", Set.of("xls")),
            Map.entry(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    Set.of("xlsx")),
            Map.entry("text/plain", Set.of("txt")),
            Map.entry("text/csv", Set.of("csv")),
            Map.entry("image/jpeg", Set.of("jpg", "jpeg")),
            Map.entry("image/png", Set.of("png")),
            Map.entry("image/webp", Set.of("webp")));

    private final Path root;
    private final long maxFileSizeBytes;

    public TaskDocumentStorage(DocsBotProperties properties) {
        this.root = Path.of(properties.dataDir())
                .toAbsolutePath()
                .normalize()
                .resolve("task-documents")
                .normalize();
        this.maxFileSizeBytes = properties.maxFileSizeBytes();
    }

    public StoredFile store(long taskId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ErpExceptions.BadRequest("File is required");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw new ErpExceptions.BadRequest("File exceeds the configured size limit");
        }
        String contentType = normalizeContentType(file.getContentType());
        if (!ALLOWED_MIME_TYPES.contains(contentType)) {
            throw new ErpExceptions.BadRequest("Unsupported file type");
        }
        String originalFilename = normalizeOriginalFilename(file.getOriginalFilename());
        validateExtension(originalFilename, contentType);
        String storedFilename = UUID.randomUUID() + "-" + safeFilename(originalFilename);
        Path taskDirectory = resolveInsideRoot(Long.toString(taskId));
        Path target = resolveInsideRoot(Long.toString(taskId), storedFilename);
        try {
            Files.createDirectories(taskDirectory);
            try (BufferedInputStream input = new BufferedInputStream(file.getInputStream())) {
                input.mark(32);
                byte[] signature = input.readNBytes(16);
                input.reset();
                if (!matchesSignature(contentType, signature)) {
                    throw new ErpExceptions.BadRequest("File content does not match its declared type");
                }
                Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Task document could not be stored", exception);
        }
        return new StoredFile(
                originalFilename,
                root.relativize(target).toString().replace('\\', '/'),
                contentType);
    }

    public StoredContent read(String relativePath) {
        Path path = resolveInsideRoot(relativePath);
        if (!Files.isRegularFile(path)) {
            throw new ErpExceptions.NotFound("Task document file not found");
        }
        try {
            String detected = Files.probeContentType(path);
            return new StoredContent(path, detected == null ? "application/octet-stream" : detected);
        } catch (IOException exception) {
            throw new IllegalStateException("Task document could not be read", exception);
        }
    }

    public void delete(String relativePath) {
        Path path = resolveInsideRoot(relativePath);
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            throw new IllegalStateException("Task document could not be deleted", exception);
        }
    }

    private Path resolveInsideRoot(String first, String... more) {
        Path resolved = root.resolve(Path.of(first, more)).normalize();
        if (!resolved.startsWith(root)) {
            throw new ErpExceptions.BadRequest("Invalid task document path");
        }
        return resolved;
    }

    private String normalizeOriginalFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "document";
        }
        String normalized = filename.replace('\\', '/');
        String leaf = normalized.substring(normalized.lastIndexOf('/') + 1).trim();
        return leaf.isBlank() ? "document" : leaf.substring(0, Math.min(leaf.length(), 255));
    }

    private void validateExtension(String filename, String contentType) {
        int separator = filename.lastIndexOf('.');
        String extension = separator < 0
                ? ""
                : filename.substring(separator + 1).toLowerCase(Locale.ROOT);
        if (!MIME_EXTENSIONS.getOrDefault(contentType, Set.of()).contains(extension)) {
            throw new ErpExceptions.BadRequest("File extension does not match its declared type");
        }
    }

    private boolean matchesSignature(String contentType, byte[] bytes) {
        if (contentType.equals("application/pdf")) {
            return startsWith(bytes, "%PDF".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        }
        if (contentType.equals("image/png")) {
            return startsWith(bytes, new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47});
        }
        if (contentType.equals("image/jpeg")) {
            return startsWith(bytes, new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});
        }
        if (contentType.equals("image/webp")) {
            return bytes.length >= 12
                    && startsWith(bytes, "RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII))
                    && bytes[8] == 'W'
                    && bytes[9] == 'E'
                    && bytes[10] == 'B'
                    && bytes[11] == 'P';
        }
        if (contentType.contains("openxmlformats")) {
            return startsWith(bytes, new byte[]{0x50, 0x4B});
        }
        if (contentType.equals("application/msword")
                || contentType.equals("application/vnd.ms-excel")) {
            return startsWith(bytes, new byte[]{
                    (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        }
        if (contentType.startsWith("text/")) {
            for (byte value : bytes) {
                if (value == 0) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    private boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private String safeFilename(String filename) {
        String ascii = Normalizer.normalize(filename, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String safe = UNSAFE_FILENAME.matcher(ascii).replaceAll("_")
                .replaceAll("_+", "_")
                .replaceAll("^[._-]+|[._-]+$", "");
        return safe.isBlank() ? "document" : safe.toLowerCase(Locale.ROOT);
    }

    private String normalizeContentType(String value) {
        if (value == null) {
            return "application/octet-stream";
        }
        int separator = value.indexOf(';');
        return (separator >= 0 ? value.substring(0, separator) : value)
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    public record StoredFile(String originalFilename, String relativePath, String contentType) {
    }

    public record StoredContent(Path path, String contentType) {
    }
}
