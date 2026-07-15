package com.docsbot.ops.erp.application;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;

import tools.jackson.databind.ObjectMapper;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApnsMobilePushGatewayTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-24T09:00:00Z"), ZoneOffset.UTC);

    @Test
    void jwtIsSignedAndCached() throws Exception {
        ApnsJwtProvider provider = new ApnsJwtProvider(properties(privateKeyPem()), objectMapper, clock);

        String first = provider.token();
        String second = provider.token();

        assertTrue(provider.configured());
        assertEquals(3, first.split("\\.").length);
        assertSame(first, second);
    }

    @Test
    void sendsIosNotificationToApns() throws Exception {
        String privateKey = privateKeyPem();
        wireMock.stubFor(com.github.tomakehurst.wiremock.client.WireMock.post(urlEqualTo("/3/device/device-token-1"))
                .willReturn(com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(200)));
        ApnsMobilePushGateway gateway = gateway(privateKey);

        MobilePushGateway.Result result = gateway.send(
                ErpMobilePushToken.create(42, "ios", "iphone-1", "device-token-1", "1.0.0", clock.instant()),
                ErpNotification.create(42, "TASK_ASSIGNED", "Yeni gorev", "Kontrol gerekli", 7L, "NORMAL", "task-assigned:7", clock.instant()));

        assertEquals(MobilePushGateway.Status.DELIVERED, result.status());
        wireMock.verify(postRequestedFor(urlEqualTo("/3/device/device-token-1"))
                .withHeader("Authorization", containing("bearer "))
                .withHeader("apns-topic", equalTo("com.mobit.docsbot"))
                .withHeader("apns-push-type", equalTo("alert"))
                .withRequestBody(containing("\"task_id\":\"7\""))
                .withRequestBody(containing("\"event_key\":\"task-assigned:7\""))
                .withRequestBody(containing("\"type\":\"TASK_ASSIGNED\"")));
    }

    @Test
    void badDeviceTokenIsPermanentFailure() throws Exception {
        wireMock.stubFor(com.github.tomakehurst.wiremock.client.WireMock.post(urlEqualTo("/3/device/bad-device-token"))
                .willReturn(com.github.tomakehurst.wiremock.client.WireMock.aResponse()
                        .withStatus(400)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"reason\":\"BadDeviceToken\"}")));
        ApnsMobilePushGateway gateway = gateway(privateKeyPem());

        MobilePushGateway.Result result = gateway.send(
                ErpMobilePushToken.create(42, "ios", "iphone-2", "bad-device-token", "1.0.0", clock.instant()),
                ErpNotification.create(42, "TASK_ASSIGNED", "Yeni gorev", "Kontrol gerekli", clock.instant()));

        assertEquals(MobilePushGateway.Status.DEAD, result.status());
        assertTrue(result.errorMessage().contains("BadDeviceToken"));
    }

    private ApnsMobilePushGateway gateway(String privateKey) {
        DocsBotProperties properties = properties(privateKey);
        return new ApnsMobilePushGateway(
                properties,
                new ApnsJwtProvider(properties, objectMapper, clock),
                objectMapper,
                java.net.http.HttpClient.newHttpClient());
    }

    private DocsBotProperties properties(String privateKey) {
        return new DocsBotProperties(
                "target/test-data",
                "target/test-vault",
                1024,
                "salt",
                false,
                new DocsBotProperties.WebPush(false, "", "", "", 0),
                new DocsBotProperties.MobilePush(
                        true,
                        "",
                        "",
                        "",
                        "",
                        "https://fcm.googleapis.com",
                        "TEAM123456",
                        "KEY1234567",
                        "com.mobit.docsbot",
                        privateKey,
                        "",
                        "sandbox",
                        wireMock.baseUrl(),
                        10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                null,
                new DocsBotProperties.AppUpdate(
                        "1.0.7",
                        "1.0.6",
                        "Yeni versiyon geldi",
                        "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
                        "https://play.google.com/store/apps/details?id=com.mobit.docsbotops"),
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
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair keyPair = generator.generateKeyPair();
        String encoded = Base64.getMimeEncoder(64, "\n".getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .encodeToString(keyPair.getPrivate().getEncoded());
        return "-----BEGIN PRIVATE KEY-----\n"
                + encoded
                + "\n-----END PRIVATE KEY-----\n";
    }
}
