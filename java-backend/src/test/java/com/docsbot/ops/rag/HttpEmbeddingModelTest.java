package com.docsbot.ops.rag;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Exercises the actual conversation with the embedding sidecar.
 *
 * <p>Everything else in the RAG pipeline is tested against a stub {@link EmbeddingModel}, which
 * meant this class — the one piece that puts bytes on a socket — was the only untested link, and it
 * was the one that broke in production: the client negotiated HTTP/2, the sidecar's uvicorn does not
 * speak it, and every POST arrived with an empty body. Health checks are GETs, so the service
 * reported itself healthy the whole time.
 */
class HttpEmbeddingModelTest {

    private HttpServer server;
    private String baseUrl;
    private volatile boolean rejectRequests;
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>();

    @BeforeEach
    void startStubService() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange ->
                respond(exchange, 200, "{\"status\":\"ok\",\"model\":\"test-model\",\"dimensions\":3}"));
        server.createContext("/embed/passages", exchange -> {
            lastRequestBody.set(readBody(exchange.getRequestBody()));
            respond(exchange, 200,
                    "{\"model\":\"test-model\",\"vectors\":[[0.1,0.2,0.3],[0.4,0.5,0.6]]}");
        });
        server.createContext("/embed/query", exchange -> {
            lastRequestBody.set(readBody(exchange.getRequestBody()));
            if (rejectRequests) {
                respond(exchange, 422,
                        "{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\"],\"msg\":\"Field required\"}]}");
                return;
            }
            respond(exchange, 200, "{\"model\":\"test-model\",\"vector\":[1.0,0.0,0.0]}");
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopStubService() {
        server.stop(0);
    }

    private HttpEmbeddingModel model() {
        return new HttpEmbeddingModel(baseUrl, new ObjectMapper());
    }

    @Test
    void speaksHttpOneOneBecauseTheSidecarDoesNotUnderstandHttpTwo() {
        // Java defaults to HTTP/2, which over plaintext opens with an "Upgrade: h2c" handshake.
        // uvicorn answers that by serving the request with no body at all, so this pin is the
        // difference between the assistant working and every document failing to index.
        assertThat(model().protocolVersion()).isEqualTo(HttpClient.Version.HTTP_1_1);
    }

    @Test
    void sendsThePassagesAndReadsTheVectorsBack() {
        List<float[]> vectors = model().embedAll(List.of("birinci bolum", "ikinci bolum"));

        assertThat(lastRequestBody.get()).contains("\"passages\"", "birinci bolum", "ikinci bolum");
        assertThat(vectors).hasSize(2);
        assertThat(vectors.get(0)).containsExactly(0.1f, 0.2f, 0.3f);
        assertThat(vectors.get(1)).containsExactly(0.4f, 0.5f, 0.6f);
    }

    @Test
    void theRequestActuallyCarriesABody() {
        model().embedQuery("teminat suresi ne kadar");

        // The production failure in one assertion: the request reached the service, and the service
        // found nothing in it. A status-code-only check passes right through that.
        assertThat(lastRequestBody.get()).isNotBlank();
        assertThat(lastRequestBody.get()).contains("teminat suresi ne kadar");
    }

    @Test
    void aRejectedRequestReportsWhatTheServiceComplainedAbout() {
        rejectRequests = true;

        // "HTTP 422" alone says a request was refused but not why; the service already names the
        // field, and dropping that answer on the floor turns a one-line fix into an investigation.
        assertThatThrownBy(() -> model().embedQuery("soru"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("422")
                .hasMessageContaining("Field required");
    }

    @Test
    void aServiceThatIsNotThereIsReportedUnavailableRatherThanThrowing() {
        // Port 1 is reserved and nothing listens on it: the sidecar being down must degrade the
        // assistant to "not ready", never break the requests that merely touch a document.
        HttpEmbeddingModel model = new HttpEmbeddingModel("http://127.0.0.1:1", new ObjectMapper());

        assertThat(model.available()).isFalse();
    }

    @Test
    void metadataComesFromTheServiceRatherThanBeingAssumed() {
        HttpEmbeddingModel model = model();

        assertThat(model.available()).isTrue();
        assertThat(model.name()).isEqualTo("test-model");
        assertThat(model.dimensions()).isEqualTo(3);
    }

    private static String readBody(InputStream stream) throws IOException {
        try (stream) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }
}
