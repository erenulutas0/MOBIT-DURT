package com.docsbot.ops.erp.application;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class FcmMobilePushGateway implements MobilePushGateway {

    private final DocsBotProperties properties;
    private final FcmAccessTokenProvider accessTokenProvider;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    /** Optional: absent in the unit tests, which build the gateway directly. */
    private final ObjectProvider<ErpNotificationRepository> notificationRepository;

    @Autowired
    public FcmMobilePushGateway(
            DocsBotProperties properties,
            FcmAccessTokenProvider accessTokenProvider,
            ObjectMapper objectMapper,
            ObjectProvider<ErpNotificationRepository> notificationRepository
    ) {
        this(properties, accessTokenProvider, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build(), notificationRepository);
    }

    FcmMobilePushGateway(
            DocsBotProperties properties,
            FcmAccessTokenProvider accessTokenProvider,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this(properties, accessTokenProvider, objectMapper, httpClient, null);
    }

    FcmMobilePushGateway(
            DocsBotProperties properties,
            FcmAccessTokenProvider accessTokenProvider,
            ObjectMapper objectMapper,
            HttpClient httpClient,
            ObjectProvider<ErpNotificationRepository> notificationRepository
    ) {
        this.properties = properties;
        this.accessTokenProvider = accessTokenProvider;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.notificationRepository = notificationRepository;
    }

    @Override
    public boolean configured() {
        return mobilePush() != null && accessTokenProvider.configured();
    }

    /**
     * The tray slot an alert occupies. Same slot → the newer one replaces the older instead of
     * stacking beside it. Scoped per task so a task's escalating deadline alerts stay a single row,
     * and per type otherwise so each recurring digest keeps exactly one. The full history is always
     * in the in-app list; the tray only needs to say "there is something to look at".
     */
    private static String trayTag(ErpNotification notification) {
        return notification.getTaskId() == null
                ? notification.getType()
                : notification.getType() + ":" + notification.getTaskId();
    }

    /** Best-effort unread count for the badge; 0 rather than a wrong number if it can't be read. */
    private int unreadCountFor(Long recipientId) {
        ErpNotificationRepository repository =
                notificationRepository == null ? null : notificationRepository.getIfAvailable();
        if (repository == null || recipientId == null) {
            return 0;
        }
        try {
            return (int) Math.min(Integer.MAX_VALUE, repository.countByUserIdAndReadAtIsNull(recipientId));
        } catch (RuntimeException ignored) {
            return 0;
        }
    }

    @Override
    public Result send(ErpMobilePushToken token, ErpNotification notification) {
        if (!configured()) {
            return Result.retry("Mobile push gateway is not configured");
        }
        try {
            boolean critical = "CRITICAL".equalsIgnoreCase(notification.getPriority());
            boolean elevated = critical || "HIGH".equalsIgnoreCase(notification.getPriority());
            String body = objectMapper.writeValueAsString(Map.of(
                    "message", Map.of(
                            "token", token.getToken(),
                            "notification", Map.of(
                                    "title", notification.getTitle(),
                                    "body", notification.getBody() == null ? "" : notification.getBody()),
                            "android", Map.of(
                                    "priority", elevated ? "HIGH" : "NORMAL",
                                    "notification", Map.of(
                                            "channel_id", critical ? "tasks_critical" : "tasks_normal",
                                            // Without a tag every push adds ANOTHER row to the tray, so
                                            // they pile up until something clears them — which is how a
                                            // phone ended up sitting on 49 delivered notifications. A tag
                                            // makes a newer alert REPLACE the one it supersedes.
                                            "tag", trayTag(notification),
                                            // Owns the launcher badge. Left unset, Android derives the
                                            // badge from the number of undismissed tray rows, so it kept
                                            // showing a stale count long after the items were read
                                            // in-app. Sending the real unread count keeps them in sync.
                                            "notification_count", unreadCountFor(notification.getUserId()))),
                            "data", Map.of(
                                    "notification_id", String.valueOf(notification.getId()),
                                    "task_id", notification.getTaskId() == null ? "" : String.valueOf(notification.getTaskId()),
                                    "event_key", notification.getEventKey() == null ? "" : notification.getEventKey(),
                                    "type", notification.getType(),
                                    "priority", notification.getPriority(),
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
