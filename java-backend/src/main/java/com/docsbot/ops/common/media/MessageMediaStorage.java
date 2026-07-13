package com.docsbot.ops.common.media;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.application.ErpExceptions;

@Component
public class MessageMediaStorage {

    private static final String REFERENCE_PREFIX = "media:";
    private static final Map<String, String> MIME_EXTENSIONS = Map.ofEntries(
            Map.entry("audio/webm", "webm"),
            Map.entry("audio/mp4", "m4a"),
            Map.entry("audio/mpeg", "mp3"),
            Map.entry("audio/ogg", "ogg"),
            Map.entry("image/jpeg", "jpg"),
            Map.entry("image/png", "png"),
            Map.entry("image/gif", "gif"),
            Map.entry("image/webp", "webp"),
            Map.entry("application/pdf", "pdf"),
            Map.entry("text/plain", "txt"));

    // Raster image types only — image/svg+xml is deliberately excluded because SVG can carry script.
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif");

    // Content types that execute active content when a browser renders them inline. Blocked
    // for "file" messages, and never served inline (see isInlineSafe) as defense in depth.
    private static final Set<String> ACTIVE_CONTENT_TYPES = Set.of(
            "text/html", "application/xhtml+xml", "image/svg+xml");

    // Only these are ever served with Content-Disposition: inline. Everything else is forced
    // to attachment so an attacker-chosen content type cannot execute on the API origin.
    private static final Set<String> INLINE_SAFE_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg",
            "application/pdf", "text/plain");

    /** Whether a stored media content type is safe to serve inline (render in the browser). */
    public static boolean isInlineSafe(String contentType) {
        return contentType != null && INLINE_SAFE_TYPES.contains(contentType.trim().toLowerCase(Locale.ROOT));
    }

    private final Path root;
    private final long maxMediaBytes;

    public MessageMediaStorage(DocsBotProperties properties) {
        this.root = Path.of(properties.dataDir())
                .toAbsolutePath()
                .normalize()
                .resolve("message-media")
                .normalize();
        this.maxMediaBytes = Math.min(properties.maxFileSizeBytes(), 8_000_000L);
    }

    public String storeDataUrl(String scope, String messageKind, String mediaData, String declaredMimeType) {
        if (mediaData == null || mediaData.isBlank()) {
            return null;
        }
        String normalized = mediaData.trim();
        if (normalized.startsWith(REFERENCE_PREFIX)) {
            ensureReadable(normalized);
            return normalized;
        }
        if (!normalized.startsWith("data:")) {
            throw new ErpExceptions.BadRequest("Message media must be a data URL");
        }
        ParsedDataUrl parsed = parseDataUrl(normalized);
        String mimeType = normalizeMimeType(parsed.mimeType(), declaredMimeType);
        validateKind(messageKind, mimeType);
        if (parsed.content().length > maxMediaBytes) {
            throw new ErpExceptions.BadRequest("Message media is too large");
        }
        String extension = MIME_EXTENSIONS.getOrDefault(mimeType, "bin");
        String safeScope = scope == null || scope.isBlank() ? "general" : scope.replaceAll("[^a-zA-Z0-9._-]+", "-");
        String filename = UUID.randomUUID() + "." + extension;
        Path directory = resolveInsideRoot(safeScope);
        Path target = resolveInsideRoot(safeScope, filename);
        try {
            Files.createDirectories(directory);
            Files.write(target, parsed.content());
        } catch (IOException exception) {
            throw new IllegalStateException("Message media could not be stored", exception);
        }
        return REFERENCE_PREFIX + safeScope + "/" + filename;
    }

    public String toDataUrl(String storedOrInlineValue, String fallbackMimeType) {
        if (storedOrInlineValue == null || storedOrInlineValue.isBlank()) {
            return null;
        }
        String normalized = storedOrInlineValue.trim();
        if (!normalized.startsWith(REFERENCE_PREFIX)) {
            return normalized;
        }
        Path path = pathForReference(normalized);
        try {
            byte[] content = Files.readAllBytes(path);
            String mimeType = mimeTypeFromPath(path, fallbackMimeType);
            return "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(content);
        } catch (IOException exception) {
            throw new ErpExceptions.NotFound("Message media not found");
        }
    }

    public boolean isReference(String value) {
        return value != null && value.trim().startsWith(REFERENCE_PREFIX);
    }

    /**
     * Best-effort deletion of a file-backed media reference. No-op for inline/legacy values or
     * a null. Each message owns a unique uuid file, so deleting it when the message row is
     * hard-deleted is safe and prevents unbounded disk growth. Failures are swallowed — a
     * leftover file is a nuisance, not a correctness problem, and must not fail the delete.
     */
    public void deleteReference(String value) {
        if (!isReference(value)) {
            return;
        }
        try {
            Files.deleteIfExists(pathForReference(value.trim()));
        } catch (IOException | RuntimeException ignored) {
            // leave the orphan rather than fail the message deletion
        }
    }

    public String reference(String value) {
        if (!isReference(value)) {
            return null;
        }
        String normalized = value.trim();
        ensureReadable(normalized);
        return normalized;
    }

    public StoredContent storedContent(String storedOrInlineValue, String fallbackMimeType) {
        if (!isReference(storedOrInlineValue)) {
            throw new ErpExceptions.NotFound("Message media not found");
        }
        String reference = storedOrInlineValue.trim();
        Path path = pathForReference(reference);
        if (!Files.isRegularFile(path)) {
            throw new ErpExceptions.NotFound("Message media not found");
        }
        return new StoredContent(
                path,
                mimeTypeFromPath(path, fallbackMimeType),
                path.getFileName().toString());
    }

    private void ensureReadable(String reference) {
        Path path = pathForReference(reference);
        if (!Files.isRegularFile(path)) {
            throw new ErpExceptions.BadRequest("Message media reference is invalid");
        }
    }

    private ParsedDataUrl parseDataUrl(String value) {
        int comma = value.indexOf(',');
        if (comma < 0) {
            throw new ErpExceptions.BadRequest("Message media data URL is invalid");
        }
        String metadata = value.substring(5, comma);
        String payload = value.substring(comma + 1);
        if (!metadata.toLowerCase(Locale.ROOT).contains(";base64")) {
            throw new ErpExceptions.BadRequest("Message media must be base64 encoded");
        }
        String mimeType = metadata.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (mimeType.isBlank()) {
            throw new ErpExceptions.BadRequest("Message media type is required");
        }
        try {
            return new ParsedDataUrl(mimeType, Base64.getDecoder().decode(padBase64(payload)));
        } catch (IllegalArgumentException exception) {
            throw new ErpExceptions.BadRequest("Message media base64 data is invalid");
        }
    }

    private String padBase64(String value) {
        String normalized = value.replaceAll("\\s+", "");
        int remainder = normalized.length() % 4;
        if (remainder == 0) {
            return normalized;
        }
        return normalized + "=".repeat(4 - remainder);
    }

    private String normalizeMimeType(String dataUrlMimeType, String declaredMimeType) {
        String normalized = dataUrlMimeType == null ? "" : dataUrlMimeType.trim().toLowerCase(Locale.ROOT);
        if (declaredMimeType != null && !declaredMimeType.isBlank()) {
            String declared = declaredMimeType.trim().toLowerCase(Locale.ROOT);
            if (!declared.equals(normalized)) {
                throw new ErpExceptions.BadRequest("Message media type does not match declared type");
            }
        }
        return normalized;
    }

    private void validateKind(String messageKind, String mimeType) {
        String kind = messageKind == null ? "file" : messageKind.trim().toLowerCase(Locale.ROOT);
        switch (kind) {
            case "voice" -> {
                if (!mimeType.startsWith("audio/")) {
                    throw new ErpExceptions.BadRequest("Voice message must be audio data");
                }
            }
            case "image" -> {
                if (!ALLOWED_IMAGE_TYPES.contains(mimeType)) {
                    throw new ErpExceptions.BadRequest("Image message must be a JPEG, PNG, WebP or GIF");
                }
            }
            case "file" -> {
                if (ACTIVE_CONTENT_TYPES.contains(mimeType)) {
                    throw new ErpExceptions.BadRequest("This file type is not allowed");
                }
            }
            default -> {
                // unknown kind: no additional constraint beyond the size/base64 checks
            }
        }
    }

    private Path pathForReference(String reference) {
        String relative = reference.substring(REFERENCE_PREFIX.length());
        if (relative.isBlank() || relative.contains("..")) {
            throw new ErpExceptions.BadRequest("Message media reference is invalid");
        }
        return resolveInsideRoot(relative);
    }

    private Path resolveInsideRoot(String first, String... more) {
        Path path = root.resolve(Path.of(first, more)).toAbsolutePath().normalize();
        if (!path.startsWith(root)) {
            throw new ErpExceptions.BadRequest("Message media path is invalid");
        }
        return path;
    }

    private String mimeTypeFromPath(Path path, String fallbackMimeType) {
        if (fallbackMimeType != null && !fallbackMimeType.isBlank()) {
            return fallbackMimeType.trim().toLowerCase(Locale.ROOT);
        }
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        String extension = dot < 0 ? "" : name.substring(dot + 1);
        return switch (extension) {
            case "webm" -> "audio/webm";
            case "m4a" -> "audio/mp4";
            case "mp3" -> "audio/mpeg";
            case "ogg" -> "audio/ogg";
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "pdf" -> "application/pdf";
            case "txt" -> "text/plain";
            default -> "application/octet-stream";
        };
    }

    private record ParsedDataUrl(String mimeType, byte[] content) {
    }

    public record StoredContent(Path path, String contentType, String filename) {
    }
}
