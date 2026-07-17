package com.docsbot.ops.erp.application.assistant;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Turkish text-to-speech via a self-hosted Piper HTTP server (open-source, CPU-friendly).
 * The synthesizer URL comes from {@code docsbot.assistant.tts-url} (env {@code DOCSBOT_TTS_URL},
 * e.g. http://docsbot-piper:5000); when unset the feature is off and callers get a 503 so mobile
 * clients can hide/disable their speech buttons gracefully.
 */
@Service
public class AssistantSpeechService {

    /** Piper reads the whole text in one go; cap it so one request can't pin the CPU for minutes. */
    public static final int MAX_TEXT_LENGTH = 600;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String ttsUrl;

    public AssistantSpeechService(@Value("${docsbot.assistant.tts-url:}") String ttsUrl) {
        this.ttsUrl = ttsUrl == null ? "" : ttsUrl.trim().replaceAll("/+$", "");
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean configured() {
        return !ttsUrl.isBlank();
    }

    public static class SpeechUnavailable extends RuntimeException {
        public SpeechUnavailable(String message) {
            super(message);
        }
    }

    /** Synthesizes the text to a WAV; throws {@link SpeechUnavailable} when TTS is off or down. */
    public byte[] synthesize(String text) {
        if (!configured()) {
            throw new SpeechUnavailable("Sesli asistan bu sunucuda yapılandırılmamış.");
        }
        String trimmed = text.trim();
        if (trimmed.length() > MAX_TEXT_LENGTH) {
            trimmed = trimmed.substring(0, MAX_TEXT_LENGTH);
        }
        // Piper's http_server expects a JSON body {"text": "..."} and returns a WAV (GET is 405,
        // raw-text POST is 500). Build it with Jackson so quotes/newlines are escaped safely.
        String jsonBody;
        try {
            jsonBody = objectMapper.writeValueAsString(Map.of("text", trimmed));
        } catch (JsonProcessingException exception) {
            throw new SpeechUnavailable("Metin ses isteğine dönüştürülemedi.");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(ttsUrl + "/"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200 || response.body() == null || response.body().length == 0) {
                throw new SpeechUnavailable("Ses sentezleyici hata döndürdü (" + response.statusCode() + ").");
            }
            return response.body();
        } catch (IOException exception) {
            throw new SpeechUnavailable("Ses sentezleyiciye ulaşılamadı.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new SpeechUnavailable("Ses sentezi kesildi.");
        }
    }
}
