package com.docsbot.ops.erp.application;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;

import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class FcmMobilePushGateway implements MobilePushGateway {

    private final DocsBotProperties properties;
    private final FcmAccessTokenProvider accessTokenProvider;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public FcmMobilePushGateway(
            DocsBotProperties properties,
            FcmAccessTokenProvider accessTokenProvider,
            ObjectMapper objectMapper
    ) {
        this(properties, accessTokenProvider, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build());
    }

    FcmMobilePushGateway(
            DocsBotProperties properties,
            FcmAccessTokenProvider accessTokenProvider,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this.properties = properties;
        this.accessTokenProvider = accessTokenProvider;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @Override
    public boolean configured() {
        return mobilePush() != null && accessTokenProvider.configured();
    }

    @Override
    public Result send(ErpMobilePushToken token, ErpNotification notification) {
        if (!configured()) {
            return Result.retry("Mobile push gateway is not configured");
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "message", Map.of(
                            "token", token.getToken(),
                            "notification", Map.of(
                                    "title", notification.getTitle(),
                                    "body", notification.getBody() == null ? "" : notification.getBody()),
                            "data", Map.of(
                                    "notification_id", String.valueOf(notification.getId()),
                                    "task_id", notification.getTaskId() == null ? "" : String.valueOf(notification.getTaskId()),
                                    "url", "/"))));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint()))
                    .timeout(Duration.ofSeconds(mobilePush().timeoutSeconds()))
                    .header("Authorization", "Bearer " + accessTokenProvider.accessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) {
                return Result.delivered();
            }
            if (status == 400 || status == 404 || status == 410) {
                return Result.dead("FCM rejected token with HTTP " + status);
            }
            return Result.retry("FCM returned HTTP " + status);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Result.retry(exception.getMessage());
        } catch (Exception exception) {
            return Result.retry(exception.getMessage());
        }
    }

    private String endpoint() {
        String baseUrl = mobilePush().fcmApiBaseUrl();
        String normalizedBase = baseUrl == null || baseUrl.isBlank()
                ? "https://fcm.googleapis.com"
                : baseUrl.replaceAll("/+$", "");
        return normalizedBase + "/v1/projects/" + mobilePush().fcmProjectId() + "/messages:send";
    }

    private DocsBotProperties.MobilePush mobilePush() {
        return properties.mobilePush();
    }
}
