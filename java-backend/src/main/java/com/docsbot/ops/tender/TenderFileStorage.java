package com.docsbot.ops.tender;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.application.ErpExceptions;

@Component
public class TenderFileStorage {

    private static final Pattern UNSAFE_FILENAME = Pattern.compile("[^a-zA-Z0-9._-]+");
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
    private static final Map<String, String> EXTENSION_MIME_TYPES = Map.ofEntries(
            Map.entry("pdf", "application/pdf"),
            Map.entry("doc", "application/msword"),
            Map.entry("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            Map.entry("xls", "application/vnd.ms-excel"),
            Map.entry("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            Map.entry("txt", "text/plain"),
            Map.entry("csv", "text/csv"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("png", "image/png"),
            Map.entry("webp", "image/webp"));

    private final Path root;
    private final long maxFileSizeBytes;

    public TenderFileStorage(DocsBotProperties properties) {
        this.root = Path.of(properties.dataDir())
                .toAbsolutePath()
                .normalize()
                .resolve("originals")
                .normalize();
        this.maxFileSizeBytes = properties.maxFileSizeBytes();
    }

    public PreparedFile prepare(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ErpExceptions.BadRequest("File is required");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw new ErpExceptions.BadRequest("File exceeds the configured size limit");
        }
        String originalFilename = normalizeOriginalFilename(file.getOriginalFilename());
        String extension = extension(originalFilename);
        String contentType = normalizeContentType(file.getContentType(), extension);
        if (!MIME_EXTENSIONS.containsKey(contentType)) {
            throw new ErpExceptions.BadRequest("Unsupported file type");
        }
        if (!MIME_EXTENSIONS.get(contentType).contains(extension)) {
            throw new ErpExceptions.BadRequest("File extension does not match its declared type");
        }
        try {
            return prepare(file.getBytes(), originalFilename, contentType);
        } catch (IOException exception) {
            throw new IllegalStateException("Tender document could not be read", exception);
        }
    }

    public PreparedFile prepare(
            byte[] content,
            String originalFilenameValue,
            String contentTypeValue
    ) {
        if (content == null || content.length == 0) {
            throw new ErpExceptions.BadRequest("File is required");
        }
        if (content.length > maxFileSizeBytes) {
            throw new ErpExceptions.BadRequest("File exceeds the configured size limit");
        }
        String originalFilename = normalizeOriginalFilename(originalFilenameValue);
        String extension = extension(originalFilename);
        String contentType = normalizeContentType(contentTypeValue, extension);
        if (!MIME_EXTENSIONS.containsKey(contentType)) {
            throw new ErpExceptions.BadRequest("Unsupported file type");
        }
        if (!MIME_EXTENSIONS.get(contentType).contains(extension)) {
            throw new ErpExceptions.BadRequest("File extension does not match its declared type");
        }
        if (!matchesSignature(contentType, content)) {
            throw new ErpExceptions.BadRequest("File content does not match its declared type");
        }
        String checksum = sha256(content);
        return new PreparedFile(
                originalFilename,
                safeFilename(originalFilename, checksum),
                contentType,
                checksum,
                content);
    }

    public StoredFile store(
            PreparedFile prepared,
            int year,
            String internalUnit,
            String organization,
            String tenderId
    ) {
        Path directory = resolveInsideRoot(
                Integer.toString(year),
                internalUnit,
                organization,
                tenderId);
        Path target = resolveInsideRoot(
                Integer.toString(year),
                internalUnit,
                organization,
                tenderId,
                prepared.safeFilename());
        try {
            Files.createDirectories(directory);
            if (Files.isRegularFile(target)) {
                String existingChecksum = sha256(Files.readAllBytes(target));
                if (!existingChecksum.equals(prepared.checksum())) {
                    target = target.resolveSibling(
                            stem(target.getFileName().toString())
                                    + "-" + prepared.checksum().substring(0, 10)
                                    + suffix(target.getFileName().toString()));
                }
            }
            Files.write(
                    target,
                    prepared.content(),
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING);
            return new StoredFile(
                    root.getParent().relativize(target).toString().replace('\\', '/'),
                    target,
                    target.getFileName().toString());
        } catch (IOException exception) {
            throw new IllegalStateException("Tender document could not be stored", exception);
        }
    }

    public boolean exists(String dataRelativePath) {
        return Files.isRegularFile(resolveDataRelativePath(dataRelativePath));
    }

    public void delete(StoredFile stored) {
        try {
            Files.deleteIfExists(stored.absolutePath());
        } catch (IOException exception) {
            throw new IllegalStateException("Tender document rollback failed", exception);
        }
    }

    private Path resolveDataRelativePath(String value) {
        Path dataRoot = root.getParent();
        Path resolved = dataRoot.resolve(value).normalize();
        if (!resolved.startsWith(dataRoot)) {
            throw new ErpExceptions.BadRequest("Invalid tender document path");
        }
        return resolved;
    }

    private Path resolveInsideRoot(String first, String... more) {
        Path resolved = root.resolve(Path.of(first, more)).normalize();
        if (!resolved.startsWith(root)) {
            throw new ErpExceptions.BadRequest("Invalid tender document path");
        }
        return resolved;
    }

    private String normalizeOriginalFilename(String filename) {
        String normalized = filename == null ? "" : filename.replace('\\', '/');
        String leaf = normalized.substring(normalized.lastIndexOf('/') + 1).trim();
        if (leaf.isBlank()) {
            throw new ErpExceptions.BadRequest("File name is required");
        }
        return leaf.substring(0, Math.min(leaf.length(), 255));
    }

    private String safeFilename(String filename, String checksum) {
        String extension = suffix(filename).toLowerCase(Locale.ROOT);
        String asciiStem = Normalizer.normalize(stem(filename), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String safeStem = UNSAFE_FILENAME.matcher(asciiStem).replaceAll("-")
                .replaceAll("-+", "-")
                .replaceAll("^[._-]+|[._-]+$", "");
        if (safeStem.isBlank()) safeStem = "document-" + checksum.substring(0, 12);
        return safeStem.substring(0, Math.min(safeStem.length(), 120)) + extension;
    }

    private String normalizeContentType(String value, String extension) {
        String normalized = value == null ? "" : value;
        int separator = normalized.indexOf(';');
        normalized = (separator >= 0 ? normalized.substring(0, separator) : normalized)
                .trim()
                .toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || normalized.equals("application/octet-stream")) {
            return EXTENSION_MIME_TYPES.getOrDefault(extension, normalized);
        }
        return normalized;
    }

    private boolean matchesSignature(String contentType, byte[] bytes) {
        if (contentType.equals("application/pdf")) {
            return startsWith(bytes, "%PDF".getBytes(StandardCharsets.US_ASCII));
        }
        if (contentType.equals("image/png")) {
            return startsWith(bytes, new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47});
        }
        if (contentType.equals("image/jpeg")) {
            return startsWith(bytes, new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});
        }
        if (contentType.equals("image/webp")) {
            return bytes.length >= 12
                    && startsWith(bytes, "RIFF".getBytes(StandardCharsets.US_ASCII))
                    && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP");
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
            for (int index = 0; index < Math.min(bytes.length, 128); index++) {
                if (bytes[index] == 0) return false;
            }
            return true;
        }
        return false;
    }

    private boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) return false;
        }
        return true;
    }

    private String extension(String filename) {
        String suffix = suffix(filename);
        return suffix.isEmpty() ? "" : suffix.substring(1).toLowerCase(Locale.ROOT);
    }

    private String stem(String filename) {
        int separator = filename.lastIndexOf('.');
        return separator <= 0 ? filename : filename.substring(0, separator);
    }

    private String suffix(String filename) {
        int separator = filename.lastIndexOf('.');
        return separator <= 0 ? "" : filename.substring(separator);
    }

    private String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record PreparedFile(
            String originalFilename,
            String safeFilename,
            String contentType,
            String checksum,
            byte[] content
    ) {
    }

    public record StoredFile(
            String relativePath,
            Path absolutePath,
            String storedFilename
    ) {
    }
}
