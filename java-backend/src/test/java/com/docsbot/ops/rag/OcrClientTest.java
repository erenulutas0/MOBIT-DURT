package com.docsbot.ops.rag;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reading scans is what stops a third of a real archive from sitting in it answering nothing. The
 * property that matters is that a failure here is quiet and harmless: OCR is a best effort on
 * documents that were already unreadable, so anything it cannot manage must leave the document
 * exactly as it was rather than break the extraction that called it.
 */
class OcrClientTest {

    private HttpServer server;
    private String baseUrl;
    private final AtomicReference<String> lastBody = new AtomicReference<>("");
    private final AtomicInteger calls = new AtomicInteger();
    private volatile String response = "{\"text\":\"Taranmis sartname metni\",\"pages\":3,\"pages_read\":3}";
    private volatile int status = 200;

    @TempDir
    Path folder;

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ocr", exchange -> {
            calls.incrementAndGet();
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, status, response);
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopStub() {
        server.stop(0);
    }

    private OcrClient client(boolean enabled, long maxBytes) {
        return new OcrClient(baseUrl, enabled, maxBytes, 30, new ObjectMapper());
    }

    private Path fileOf(String content) throws IOException {
        Path path = folder.resolve("sartname.pdf");
        Files.writeString(path, content);
        return path;
    }

    @Test
    void readsTheTextOffAScan() throws IOException {
        String text = client(true, 10_000_000).read(fileOf("%PDF-1.4 taranmis"), "sartname.pdf");

        assertThat(text).isEqualTo("Taranmis sartname metni");
        assertThat(lastBody.get()).contains("filename=\"sartname.pdf\"").contains("taranmis");
    }

    @Test
    void aFileTooLargeIsNotEvenAttempted() throws IOException {
        String text = client(true, 8).read(fileOf("%PDF-1.4 cok buyuk bir tarama"), "buyuk.pdf");

        // One 200MB scan would hold the single OCR worker for the better part of an hour and
        // starve every document queued behind it.
        assertThat(text).isEmpty();
        assertThat(calls.get()).isZero();
    }

    @Test
    void aServiceErrorLeavesTheDocumentAloneRatherThanThrowing() throws IOException {
        status = 500;

        // OCR runs on documents that were already unreadable. Throwing here would turn "we could
        // not improve this" into "extraction failed", which is a different and wrong story.
        assertThat(client(true, 10_000_000).read(fileOf("%PDF-1.4 x"), "bozuk.pdf")).isEmpty();
    }

    @Test
    void aReportedFailureIsTreatedAsNothingReadRatherThanAsText() throws IOException {
        response = "{\"text\":\"\",\"pages\":0,\"pages_read\":0,\"error\":\"file is encrypted\"}";

        assertThat(client(true, 10_000_000).read(fileOf("%PDF-1.4 x"), "sifreli.pdf")).isEmpty();
    }

    @Test
    void switchingItOffSkipsTheServiceEntirely() throws IOException {
        assertThat(client(false, 10_000_000).read(fileOf("%PDF-1.4 x"), "sartname.pdf")).isEmpty();
        assertThat(calls.get()).isZero();
    }

    @Test
    void aMissingFileIsReportedRatherThanCrashingTheSweep() {
        // The row can outlive the file; one bad document must not stop the queue behind it.
        assertThat(client(true, 10_000_000).read(folder.resolve("yok.pdf"), "yok.pdf")).isEmpty();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }
}
