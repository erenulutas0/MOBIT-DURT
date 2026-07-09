package com.docsbot.ops.telegram;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.tender.TenderIngestionService;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.Mockito.*;

class TelegramUpdateAuthorizationTest {

    private final TelegramGateway gateway = mock(TelegramGateway.class);
    private final TelegramTenderService tenderService = mock(TelegramTenderService.class);
    private final TenderIngestionService ingestionService = mock(TenderIngestionService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void ignoresUpdatesFromChatsOutsideAllowlistBeforeAnySideEffect() throws Exception {
        TelegramUpdateProcessor processor = processor("-1001", "42");

        processor.process(objectMapper.readTree("""
                {
                  "message":{
                    "message_id":1,
                    "chat":{"id":-9999,"title":"Unknown"},
                    "from":{"id":42},
                    "text":"/company"
                  }
                }
                """));

        verifyNoInteractions(gateway, tenderService, ingestionService);
    }

    @Test
    void catalogWriteRequiresConfiguredAdminAndTelegramAdminStatus() throws Exception {
        TelegramUpdateProcessor processor = processor("-1001", "42");
        var command = objectMapper.readTree("""
                {
                  "message":{
                    "message_id":1,
                    "chat":{"id":-1001,"title":"Allowed"},
                    "from":{"id":84},
                    "text":"/company_add New Company"
                  }
                }
                """);

        processor.process(command);

        verify(gateway, never()).isChatAdministrator(anyString(), anyString());
        verify(gateway).sendMessage(
                "-1001",
                "Yeni şirket eklemek için grup yöneticisi olmalısınız.");
        verifyNoInteractions(tenderService, ingestionService);
    }

    @Test
    void securityInfoShowsCurrentChatAndSenderIds() throws Exception {
        TelegramUpdateProcessor processor = processor("", "");

        processor.process(objectMapper.readTree("""
                {
                  "message":{
                    "message_id":1,
                    "chat":{"id":-1001,"title":"Allowed"},
                    "from":{"id":42},
                    "text":"/security_info"
                  }
                }
                """));

        verify(gateway).sendMessage(
                "-1001",
                "Telegram güvenlik bilgileri\nGrup ID: -1001\nKullanıcı ID: 42");
        verifyNoInteractions(tenderService, ingestionService);
    }

    private TelegramUpdateProcessor processor(String chatIds, String adminIds) {
        DocsBotProperties properties = new DocsBotProperties(
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
                        "http://127.0.0.1",
                        1,
                        1000,
                        chatIds,
                        adminIds,
                        "polling",
                        "",
                        ""),
                new DocsBotProperties.Admin("admin", "password", "Admin"),
                new DocsBotProperties.Jwt(
                        "issuer",
                        "01234567890123456789012345678901",
                        15));
        return new TelegramUpdateProcessor(
                gateway,
                new TelegramUpdateParser(),
                tenderService,
                ingestionService,
                new TelegramAccessPolicy(properties));
    }
}
