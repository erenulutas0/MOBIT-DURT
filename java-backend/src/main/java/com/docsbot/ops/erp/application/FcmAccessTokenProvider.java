package com.docsbot.ops.erp.application;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class FcmAccessTokenProvider {
    private static final String FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
    private static final String JWT_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
    private static final Duration TOKEN_EXPIRY_SKEW = Duration.ofSeconds(60);

    private final DocsBotProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Clock clock;
    private volatile CachedToken cachedToken;

    @Autowired
    public FcmAccessTokenProvider(DocsBotProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build(), Clock.systemUTC());
    }

    FcmAccessTokenProvider(
            DocsBotProperties properties,
            ObjectMapper objectMapper,
            HttpClient httpClient,
            Clock clock
    ) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.clock = clock;
    }

    public boolean configured() {
        DocsBotProperties.MobilePush mobilePush = mobilePush();
        return mobilePush != null && mobilePush.fcmConfigured();
    }

    public String accessToken() {
        DocsBotProperties.MobilePush mobilePush = mobilePush();
        if (mobilePush == null || !mobilePush.enabled()) {
            throw new IllegalStateException("Mobile push is not enabled");
        }
        if (!blank(mobilePush.fcmAccessToken())) {
            return mobilePush.fcmAccessToken().trim();
        }

        CachedToken current = cachedToken;
        Instant now = clock.instant();
        if (current != null && current.expiresAt().minus(TOKEN_EXPIRY_SKEW).isAfter(now)) {
            return current.value();
        }
        synchronized (this) {
            current = cachedToken;
            now = clock.instant();
            if (current != null && current.expiresAt().minus(TOKEN_EXPIRY_SKEW).isAfter(now)) {
                return current.value();
            }
            cachedToken = requestServiceAccountToken(mobilePush, now);
            return cachedToken.value();
        }
    }

    private CachedToken requestServiceAccountToken(DocsBotProperties.MobilePush mobilePush, Instant now) {
        ServiceAccount serviceAccount = serviceAccount(mobilePush);
        String assertion = assertion(serviceAccount, now);
        String body = "grant_type=" + encode(JWT_GRANT_TYPE)
                + "&assertion=" + encode(assertion);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(serviceAccount.tokenUri()))
                    .timeout(Duration.ofSeconds(mobilePush.timeoutSeconds()))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("FCM OAuth token request failed with HTTP " + response.statusCode());
            }
            JsonNode decoded = objectMapper.readTree(response.body());
            String token = decoded.path("access_token").asText("");
            long expiresIn = decoded.path("expires_in").asLong(3600);
            if (token.isBlank()) {
                throw new IllegalStateException("FCM OAuth response did not include an access token");
            }
            return new CachedToken(token, now.plusSeconds(Math.max(60, expiresIn)));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("FCM OAuth token request was interrupted", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("FCM OAuth token request failed", exception);
        }
    }

    private ServiceAccount serviceAccount(DocsBotProperties.MobilePush mobilePush) {
        String json = mobilePush.fcmServiceAccountJson();
        if (blank(json) && !blank(mobilePush.fcmServiceAccountPath())) {
            try {
                json = Files.readString(Path.of(mobilePush.fcmServiceAccountPath()), StandardCharsets.UTF_8);
            } catch (IOException exception) {
                throw new IllegalStateException("FCM service account file could not be read", exception);
            }
        }
        if (blank(json)) {
            throw new IllegalStateException("FCM service account credentials are not configured");
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            String clientEmail = node.path("client_email").asText("");
            String privateKey = node.path("private_key").asText("");
            String tokenUri = node.path("token_uri").asText("https://oauth2.googleapis.com/token");
            if (clientEmail.isBlank() || privateKey.isBlank()) {
                throw new IllegalStateException("FCM service account JSON must include client_email and private_key");
            }
            return new ServiceAccount(clientEmail, privateKey, tokenUri);
        } catch (Exception exception) {
            throw new IllegalStateException("FCM service account JSON could not be parsed", exception);
        }
    }

    private String assertion(ServiceAccount serviceAccount, Instant now) {
        try {
            long issuedAt = now.getEpochSecond();
            long expiresAt = issuedAt + 3600;
            String header = objectMapper.writeValueAsString(Map.of("alg", "RS256", "typ", "JWT"));
            String claims = objectMapper.writeValueAsString(Map.of(
                    "iss", serviceAccount.clientEmail(),
                    "scope", FIREBASE_SCOPE,
                    "aud", serviceAccount.tokenUri(),
                    "iat", issuedAt,
                    "exp", expiresAt));
            String signingInput = base64Url(header.getBytes(StandardCharsets.UTF_8))
                    + "."
                    + base64Url(claims.getBytes(StandardCharsets.UTF_8));
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey(serviceAccount.privateKey()));
            signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
            return signingInput + "." + base64Url(signature.sign());
        } catch (Exception exception) {
            throw new IllegalStateException("FCM OAuth JWT could not be signed", exception);
        }
    }

    private PrivateKey privateKey(String pem) throws Exception {
        String stripped = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(stripped);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(decoded));
    }

    private String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private DocsBotProperties.MobilePush mobilePush() {
        return properties.mobilePush();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record ServiceAccount(String clientEmail, String privateKey, String tokenUri) {
    }

    private record CachedToken(String value, Instant expiresAt) {
    }
}
