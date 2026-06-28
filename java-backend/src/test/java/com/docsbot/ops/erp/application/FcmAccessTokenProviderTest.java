package com.docsbot.ops.erp.application;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;

import tools.jackson.databind.ObjectMapper;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FcmAccessTokenProviderTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-24T09:00:00Z"), ZoneOffset.UTC);

    @Test
    void staticAccessTokenBypassesServiceAccountExchange() {
        FcmAccessTokenProvider provider = new FcmAccessTokenProvider(
                properties("static-token-value-that-is-long-enough", "", ""),
                objectMapper,
                java.net.http.HttpClient.newHttpClient(),
                clock);

        assertTrue(provider.configured());
        assertEquals("static-token-value-that-is-long-enough", provider.accessToken());
    }

    @Test
    void serviceAccountTokenIsRequestedAndCached() throws Exception {
        wireMock.stubFor(com.github.tomakehurst.wiremock.client.WireMock.post(urlEqualTo("/token"))
                .willReturn(okJson("""
                        {"access_token":"oauth-token","expires_in":3600}
                        """)));
        String serviceAccountJson = """
                {
                  "client_email":"firebase-adminsdk@example.iam.gserviceaccount.com",
                  "private_key":"%s",
                  "token_uri":"%s/token"
                }
                """.formatted(privateKeyPem(), wireMock.baseUrl());
        FcmAccessTokenProvider provider = new FcmAccessTokenProvider(
                properties("", serviceAccountJson, ""),
                objectMapper,
                java.net.http.HttpClient.newHttpClient(),
                clock);

        assertTrue(provider.configured());
        assertEquals("oauth-token", provider.accessToken());
        assertEquals("oauth-token", provider.accessToken());

        wireMock.verify(exactly(1), postRequestedFor(urlEqualTo("/token"))
                .withHeader("Content-Type", equalTo("application/x-www-form-urlencoded")));
    }

    private DocsBotProperties properties(String accessToken, String serviceAccountJson, String serviceAccountPath) {
        return new DocsBotProperties(
                "target/test-data",
                "target/test-vault",
                1024,
                "salt",
                false,
                new DocsBotProperties.WebPush(false, "", "", "", 0),
                new DocsBotProperties.MobilePush(
                        true,
                        "docsbot-test",
                        accessToken,
                        serviceAccountJson,
                        serviceAccountPath,
                        "https://fcm.googleapis.com",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "sandbox",
                        "",
                        10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                new DocsBotProperties.Telegram(
                        false,
                        "test-token",
                        "http://127.0.0.1",
                        1,
                        1000,
                        "",
                        "",
                        "polling",
                        "",
                        ""),
                new DocsBotProperties.Admin("admin", "password", "Admin"),
                new DocsBotProperties.Jwt("issuer", "01234567890123456789012345678901", 15));
    }

    private String privateKeyPem() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair keyPair = generator.generateKeyPair();
        String encoded = Base64.getMimeEncoder(64, "\n".getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .encodeToString(keyPair.getPrivate().getEncoded());
        return "-----BEGIN PRIVATE KEY-----\\n"
                + encoded.replace("\n", "\\n")
                + "\\n-----END PRIVATE KEY-----\\n";
    }
}
