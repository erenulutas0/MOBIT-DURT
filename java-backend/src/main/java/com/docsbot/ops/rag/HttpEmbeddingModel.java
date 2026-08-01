package com.docsbot.ops.rag;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Talks to the self-hosted embedding sidecar (see {@code embedding-service/}), reached only over the
 * internal Docker network. No API key and no per-document cost, and document text never leaves the
 * server — which is the answer to the first question any tender company asks about an AI feature.
 *
 * <p>Unavailability is reported, never thrown from {@link #available()}: the sidecar being down must
 * degrade search to "not ready yet", not break every request that happens to touch a document.
 */
@Service
@Profile("postgres")
public class HttpEmbeddingModel implements EmbeddingModel {

    private static final Logger log = LoggerFactory.getLogger(HttpEmbeddingModel.class);
    /** Indexing sends hundreds of passages, so this is generous; queries are far below it. */
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(120);

    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private volatile String modelName = "unknown";
    private volatile int dimensions;

    public HttpEmbeddingModel(
            @Value("${docsbot.rag.embedding-url:http://docsbot-embeddings:5001}") String baseUrl,
            ObjectMapper objectMapper
    ) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public String name() {
        if (dimensions == 0) {
            refreshMetadata();
        }
        return modelName;
    }

    @Override
    public int dimensions() {
        if (dimensions == 0) {
            refreshMetadata();
        }
        return dimensions;
    }

    @Override
    public boolean available() {
        refreshMetadata();
        return dimensions > 0;
    }

    @Override
    public List<float[]> embedAll(List<String> passages) {
        if (passages.isEmpty()) {
            return List.of();
        }
        JsonNode body = post("/embed/passages", Map.of("passages", passages));
        JsonNode vectors = body.get("vectors");
        List<float[]> embedded = new ArrayList<>(passages.size());
        for (JsonNode vector : vectors) {
            embedded.add(toFloats(vector));
        }
        if (embedded.size() != passages.size()) {
            throw new IllegalStateException(
                    "Embedding service returned " + embedded.size() + " vectors for " + passages.size() + " passages");
        }
        rememberModel(body, embedded.isEmpty() ? 0 : embedded.get(0).length);
        return embedded;
    }

    @Override
    public float[] embedQuery(String query) {
        JsonNode body = post("/embed/query", Map.of("query", query));
        float[] vector = toFloats(body.get("vector"));
        rememberModel(body, vector.length);
        return vector;
    }

    private void refreshMetadata() {
        try {
            HttpResponse<String> response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(baseUrl + "/health"))
                            .timeout(Duration.ofSeconds(5))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                dimensions = 0;
                return;
            }
            JsonNode body = objectMapper.readTree(response.body());
            modelName = body.path("model").asString("unknown");
            dimensions = body.path("dimensions").asInt(0);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            dimensions = 0;
        } catch (RuntimeException exception) {
            log.debug("Embedding service is not reachable at {}", baseUrl, exception);
            dimensions = 0;
        } catch (Exception exception) {
            log.debug("Embedding service is not reachable at {}", baseUrl, exception);
            dimensions = 0;
        }
    }

    private JsonNode post(String path, Map<String, Object> payload) {
        try {
            HttpResponse<String> response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(baseUrl + path))
                            .timeout(REQUEST_TIMEOUT)
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("Embedding service returned HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Embedding request interrupted", exception);
        } catch (IllegalStateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Embedding request failed: " + exception.getMessage(), exception);
        }
    }

    private void rememberModel(JsonNode body, int vectorLength) {
        String reported = body.path("model").asString("");
        if (!reported.isBlank()) {
            modelName = reported;
        }
        if (vectorLength > 0) {
            dimensions = vectorLength;
        }
    }

    private static float[] toFloats(JsonNode array) {
        float[] vector = new float[array.size()];
        for (int index = 0; index < vector.length; index++) {
            vector[index] = (float) array.get(index).asDouble();
        }
        return vector;
    }
}
