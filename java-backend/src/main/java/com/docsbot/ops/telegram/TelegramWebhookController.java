package com.docsbot.ops.telegram;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.common.config.DocsBotProperties;
import tools.jackson.databind.JsonNode;

@RestController
@Profile("postgres")
@RequestMapping("/webhook/telegram")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "enabled",
        havingValue = "true")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "mode",
        havingValue = "webhook")
public class TelegramWebhookController {

    private final TelegramUpdateProcessor processor;
    private final byte[] expectedSecret;

    public TelegramWebhookController(
            TelegramUpdateProcessor processor,
            DocsBotProperties properties
    ) {
        this.processor = processor;
        String secret = properties.telegram().webhookSecret();
        this.expectedSecret = secret == null
                ? new byte[0]
                : secret.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping
    public ResponseEntity<Void> receive(
            @RequestHeader(
                    name = "X-Telegram-Bot-Api-Secret-Token",
                    required = false)
            String providedSecret,
            @RequestBody JsonNode update
    ) {
        byte[] provided = providedSecret == null
                ? new byte[0]
                : providedSecret.getBytes(StandardCharsets.UTF_8);
        if (expectedSecret.length == 0
                || !MessageDigest.isEqual(expectedSecret, provided)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        processor.process(update);
        return ResponseEntity.ok().build();
    }
}
