package com.docsbot.ops.telegram;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;

import com.docsbot.ops.common.config.DocsBotProperties;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;

class HttpTelegramGatewayTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    @Test
    void pollsDownloadsAndSendsWithoutRealApiCalls() {
        wireMock.stubFor(post(urlEqualTo("/bottest-token/getUpdates"))
                .willReturn(okJson("""
                        {"ok":true,"result":[{"update_id":42}]}
                        """)));
        wireMock.stubFor(post(urlEqualTo("/bottest-token/getFile"))
                .willReturn(okJson("""
                        {
                          "ok":true,
                          "result":{"file_path":"documents/file.pdf","file_size":9}
                        }
                        """)));
        wireMock.stubFor(get(urlEqualTo("/file/bottest-token/documents/file.pdf"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/pdf")
                        .withBody("pdf bytes")));
        wireMock.stubFor(post(urlEqualTo("/bottest-token/sendMessage"))
                .willReturn(okJson("{\"ok\":true,\"result\":{}}")));
        wireMock.stubFor(post(urlEqualTo("/bottest-token/getChatMember"))
                .willReturn(okJson("""
                        {"ok":true,"result":{"status":"administrator"}}
                        """)));
        wireMock.stubFor(post(urlEqualTo("/bottest-token/setWebhook"))
                .willReturn(okJson("{\"ok\":true,\"result\":true}")));
        wireMock.stubFor(post(urlEqualTo("/bottest-token/deleteWebhook"))
                .willReturn(okJson("{\"ok\":true,\"result\":true}")));

        HttpTelegramGateway gateway = new HttpTelegramGateway(
                new ObjectMapper(),
                properties(wireMock.baseUrl()));

        assertEquals(42, gateway.getUpdates(null).getFirst().path("update_id").asInt());
        TelegramGateway.DownloadedFile file = gateway.downloadFile("file-id", 9L);
        assertArrayEquals("pdf bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8), file.content());
        assertEquals("application/pdf", file.contentType());
        gateway.sendMessage("-100", "saved");
        assertEquals(true, gateway.isChatAdministrator("-100", "987"));
        gateway.configureWebhook(
                "https://example.test/webhook/telegram",
                "0123456789abcdef");
        gateway.disableWebhook();

        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/getUpdates"))
                .withRequestBody(containing("\"timeout\":1")));
        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/getFile"))
                .withRequestBody(containing("\"file_id\":\"file-id\"")));
        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/sendMessage"))
                .withRequestBody(containing("\"chat_id\":\"-100\"")));
        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/getChatMember"))
                .withRequestBody(containing("\"user_id\":\"987\"")));
        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/setWebhook"))
                .withRequestBody(containing("\"secret_token\":\"0123456789abcdef\"")));
        wireMock.verify(postRequestedFor(urlEqualTo("/bottest-token/deleteWebhook"))
                .withRequestBody(containing("\"drop_pending_updates\":false")));
    }

    private DocsBotProperties properties(String baseUrl) {
        return new DocsBotProperties(
                "target/test-data",
                "target/test-vault",
                1024,
                "salt",
                false,
                new DocsBotProperties.WebPush(false, "", "", "", 0),
                new DocsBotProperties.MobilePush(false, "", "", "", "", "https://fcm.googleapis.com", "", "", "", "", "", "sandbox", "", 10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                new DocsBotProperties.AppUpdate(
                        "1.0.7",
                        "1.0.6",
                        "Yeni versiyon geldi",
                        "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
                        "https://play.google.com/store/apps/details?id=com.mobit.docsbotops"),
                new DocsBotProperties.Telegram(
                        false,
                        "test-token",
                        baseUrl,
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
}
