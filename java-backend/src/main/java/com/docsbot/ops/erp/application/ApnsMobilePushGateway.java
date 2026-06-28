package com.docsbot.ops.erp.application;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class ApnsMobilePushGateway implements MobilePushGateway {
    private static final Set<String> DEAD_TOKEN_REASONS = Set.of(
            "BadDeviceToken",
            "DeviceTokenNotForTopic",
            "Unregistered");

    private final DocsBotProperties properties;
    private final ApnsJwtProvider jwtProvider;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public ApnsMobilePushGateway(
            DocsBotProperties properties,
            ApnsJwtProvider jwtProvider,
            ObjectMapper objectMapper
    ) {
        this(properties, jwtProvider, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .version(HttpClient.Version.HTTP_2)
                .build());
    }

    ApnsMobilePushGateway(
            DocsBotProperties properties,
            ApnsJwtProvider jwtProvider,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this.properties = properties;
        this.jwtProvider = jwtProvider;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @Override
    public boolean configured() {
        DocsBotProperties.MobilePush mobilePush = mobilePush();
        return mobilePush != null && mobilePush.apnsConfigured() && jwtProvider.configured();
    }

    @Override
    public Result send(ErpMobilePushToken token, ErpNotification notification) {
        if (!configured()) {
            return Result.retry("APNs mobile push gateway is not configured");
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "aps", Map.of(
                            "alert", Map.of(
                                    "title", notification.getTitle(),
                                    "body", notification.getBody() == null ? "" : notification.getBody()),
                            "sound", "default"),
                    "notification_id", String.valueOf(notification.getId()),
                    "task_id", notification.getTaskId() == null ? "" : String.valueOf(notification.getTaskId()),
                    "url", "/"));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint(token)))
                    .timeout(Duration.ofSeconds(mobilePush().timeoutSeconds()))
                    .header("Authorization", "bearer " + jwtProvider.token())
                    .header("Content-Type", "application/json")
                    .header("apns-topic", mobilePush().apnsBundleId())
                    .header("apns-push-type", "alert")
                    .header("apns-priority", "10")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return result(response.statusCode(), response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Result.retry(exception.getMessage());
        } catch (Exception exception) {
            return Result.retry(exception.getMessage());
        }
    }

    private Result result(int status, String body) {
        if (status >= 200 && status < 300) {
            return Result.delivered();
        }
        String reason = reason(body);
        String suffix = reason.isBlank() ? "" : ": " + reason;
        if (status == 410 || DEAD_TOKEN_REASONS.contains(reason)) {
            return Result.dead("APNs rejected token with HTTP " + status + suffix);
        }
        return Result.retry("APNs returned HTTP " + status + suffix);
    }

    private String reason(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            return node.path("reason").asText("");
        } catch (Exception ignored) {
            return "";
        }
    }

    private String endpoint(ErpMobilePushToken token) {
        return baseUrl() + "/3/device/" + token.getToken().trim();
    }

    private String baseUrl() {
        String explicitBase = mobilePush().apnsApiBaseUrl();
        if (explicitBase != null && !explicitBase.isBlank()) {
            return explicitBase.replaceAll("/+$", "");
        }
        String environment = mobilePush().apnsEnvironment() == null
                ? "sandbox"
                : mobilePush().apnsEnvironment().trim().toLowerCase(Locale.ROOT);
        if ("production".equals(environment)) {
            return "https://api.push.apple.com";
        }
        return "https://api.sandbox.push.apple.com";
    }

    private DocsBotProperties.MobilePush mobilePush() {
        return properties.mobilePush();
    }
}
