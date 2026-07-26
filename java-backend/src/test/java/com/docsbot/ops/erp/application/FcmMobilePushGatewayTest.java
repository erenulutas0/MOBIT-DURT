package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;

import tools.jackson.databind.ObjectMapper;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The tray payload. Without a tag every push added another row to the Android tray and they piled
 * up until something cleared them — which is how a phone ended up sitting on a stuck badge of 49.
 */
class FcmMobilePushGatewayTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-26T09:00:00Z"), ZoneOffset.UTC);

    @Test
    void aTaskAlertOccupiesOneTraySlotPerTaskAndType() {
        wireMock.stubFor(post(urlPathMatching(".*")).willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(200)));

        MobilePushGateway.Result result = gateway().send(
                ErpMobilePushToken.create(42, "android", "phone-1", "fcm-token-1", "1.0.27", clock.instant()),
                ErpNotification.create(42, "task_due_soon", "Görev termini yaklaşıyor", "Site yapma",
                        7L, "HIGH", "task_due_soon:7:24h", clock.instant()));

        assertEquals(MobilePushGateway.Status.DELIVERED, result.status());
        wireMock.verify(postRequestedFor(urlPathMatching(".*"))
                // Same task + type → the newer alert REPLACES the older one instead of stacking.
                .withRequestBody(containing("\"tag\":\"task_due_soon:7\""))
                // The badge is Android's to count from the tray: an explicit notification_count is
                // stamped once and never revised, so it survives the user dismissing the rows.
                .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.notContaining(
                        "notification_count")));
    }

    @Test
    void aTaskLessDigestKeepsExactlyOneTraySlotForItsType() {
        wireMock.stubFor(post(urlPathMatching(".*")).willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(200)));

        gateway().send(
                ErpMobilePushToken.create(0, "android", "phone-2", "fcm-token-2", "1.0.27", clock.instant()),
                ErpNotification.create(0, "manager_weekly_digest", "Haftalık termin özeti", "5 görev",
                        null, "NORMAL", "admin_week_digest:2026-W30", clock.instant()));

        wireMock.verify(postRequestedFor(urlPathMatching(".*"))
                .withRequestBody(containing("\"tag\":\"manager_weekly_digest\"")));
    }

    private FcmMobilePushGateway gateway() {
        DocsBotProperties properties = properties();
        return new FcmMobilePushGateway(
                properties,
                new StubAccessTokenProvider(properties, objectMapper),
                objectMapper,
                java.net.http.HttpClient.newHttpClient());
    }

    /** The real provider needs a service account; the payload is what this test is about. */
    private static final class StubAccessTokenProvider extends FcmAccessTokenProvider {
        private StubAccessTokenProvider(DocsBotProperties properties, ObjectMapper objectMapper) {
            super(properties, objectMapper);
        }

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public String accessToken() {
            return "test-access-token";
        }
    }

    private DocsBotProperties properties() {
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
                        "",
                        "",
                        "",
                        wireMock.baseUrl(),
                        "TEAM123456",
                        "KEY1234567",
                        "com.mobit.docsbot",
                        "",
                        "",
                        "sandbox",
                        wireMock.baseUrl(),
                        10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                null,
                new DocsBotProperties.AppUpdate("1.0.27", "1.0.26", "", "", ""),
                new DocsBotProperties.Telegram(
                        false, "test-token", "http://127.0.0.1", 1, 1000, "", "", "polling", "", ""),
                new DocsBotProperties.Admin("admin", "password", "Admin"),
                new DocsBotProperties.Jwt("issuer", "01234567890123456789012345678901", 15));
    }
}
