package com.docsbot.ops.telegram;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "docsbot.telegram.enabled=true",
        "docsbot.telegram.mode=webhook",
        "docsbot.telegram.webhook-url=https://example.test/webhook/telegram",
        "docsbot.telegram.webhook-secret=0123456789abcdef"
})
@ActiveProfiles("postgres")
@AutoConfigureMockMvc
class TelegramWebhookIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TelegramUpdateProcessor processor;

    @MockitoBean
    private TelegramGateway gateway;

    @Test
    void acceptsOnlyRequestsWithConfiguredTelegramSecret() throws Exception {
        String update = """
                {"update_id":42,"message":{"chat":{"id":-1001},"text":"/help"}}
                """;

        mockMvc.perform(post("/webhook/telegram")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/webhook/telegram")
                        .header(
                                "X-Telegram-Bot-Api-Secret-Token",
                                "wrong-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/webhook/telegram")
                        .header(
                                "X-Telegram-Bot-Api-Secret-Token",
                                "0123456789abcdef")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update))
                .andExpect(status().isOk());

        verify(processor).process(argThat(value ->
                value.path("update_id").asLong() == 42));
        verify(gateway).configureWebhook(
                "https://example.test/webhook/telegram",
                "0123456789abcdef");
    }
}
