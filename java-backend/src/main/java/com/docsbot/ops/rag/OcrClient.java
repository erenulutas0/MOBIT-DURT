package com.docsbot.ops.rag;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Reads scanned documents, by asking the sidecar to run them through Tesseract.
 *
 * <p>A third of a real tender archive turns out to be scans: an idare emails a signed PDF with no
 * text layer, somebody photographs a page. Tika extracts nothing from those, and until now they sat
 * in the archive answering no questions and saying so to nobody — the worst failure mode this
 * system has, because it looks exactly like a complete corpus.
 *
 * <p>Sends the bytes rather than a path. The sidecar is shared by every tenant, and the moment it
 * can open one customer's files it has to be trusted not to open another's; over the internal
 * network it cannot reach any of them.
 */
@Service
@Profile("postgres")
public class OcrClient {

    private static final Logger log = LoggerFactory.getLogger(OcrClient.class);
    private static final String BOUNDARY = "----docsbot-ocr-boundary";

    private final String baseUrl;
    private final boolean enabled;
    private final long maxBytes;
    private final Duration timeout;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OcrClient(
            @Value("${docsbot.rag.embedding-url:http://docsbot-embeddings:5001}") String baseUrl,
            @Value("${docsbot.ocr.enabled:true}") boolean enabled,
            @Value("${docsbot.ocr.max-bytes:52428800}") long maxBytes,
            @Value("${docsbot.ocr.timeout-seconds:600}") long timeoutSeconds,
            ObjectMapper objectMapper
    ) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.enabled = enabled;
        this.maxBytes = maxBytes;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.objectMapper = objectMapper;
        // HTTP/1.1 for the same reason the embedding client pins it: the sidecar runs on uvicorn,
        // which answers Java's HTTP/2 upgrade by serving the request with an empty body.
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean enabled() {
        return enabled;
    }

    /** The text read off a scan, or empty when there was nothing readable in it. */
    public String read(Path path, String filename) {
        if (!enabled) {
            return "";
        }
        try {
            long size = Files.size(path);
            if (size > maxBytes) {
                // Not attempted rather than attempted and abandoned: a 200MB scan would hold the
                // one OCR worker for the better part of an hour and starve every document behind it.
                log.info("ocr_skipped_too_large file={} bytes={}", filename, size);
                return "";
            }
            JsonNode body = post(Files.readAllBytes(path), filename);
            String text = body.path("text").asString("");
            int pages = body.path("pages").asInt(0);
            int read = body.path("pages_read").asInt(0);
            String error = body.path("error").asString("");
            if (!error.isBlank()) {
                log.warn("ocr_failed file={} reason={}", filename, error);
                return "";
            }
            if (pages > read) {
                // Says what was left unread rather than quietly returning a partial document: the
                // page cap is a number somebody can raise, and it cannot be raised unseen.
                log.info("ocr_truncated file={} pages={} read={}", filename, pages, read);
            }
            log.info("ocr_read file={} pages={} chars={}", filename, read, text.length());
            return text;
        } catch (IOException | RuntimeException exception) {
            log.warn("ocr_failed file={} reason={}", filename, exception.getMessage());
            return "";
        }
    }

    private JsonNode post(byte[] content, String filename) {
        try {
            HttpResponse<String> response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(baseUrl + "/ocr"))
                            .timeout(timeout)
                            .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                            .POST(HttpRequest.BodyPublishers.ofByteArrays(multipart(content, filename)))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("OCR service returned HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("OCR request interrupted", exception);
        } catch (IllegalStateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("OCR request failed: " + exception.getMessage(), exception);
        }
    }

    /** Hand-built so the file streams as bytes rather than being pushed through a String. */
    private static List<byte[]> multipart(byte[] content, String filename) {
        String safeName = filename == null ? "document" : filename.replace("\"", "");
        String header = "--" + BOUNDARY + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + safeName + "\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n";
        List<byte[]> parts = new ArrayList<>(3);
        parts.add(header.getBytes(StandardCharsets.UTF_8));
        parts.add(content);
        parts.add(("\r\n--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return parts;
    }
}
