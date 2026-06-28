package com.docsbot.ops.telegram;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TelegramUpdateParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TelegramUpdateParser parser = new TelegramUpdateParser();

    @Test
    void parsesDocumentAndChoosesLargestPhoto() throws Exception {
        var document = parser.media(objectMapper.readTree("""
                {
                  "update_id":1,
                  "message":{
                    "message_id":55,
                    "date":1780300800,
                    "chat":{"id":-100123,"type":"group"},
                    "from":{"id":987},
                    "caption":"BEDAŞ 2026 teknik şartname",
                    "document":{
                      "file_id":"telegram-file-id",
                      "file_name":"BEDAS-2026-teknik-sartname.pdf",
                      "mime_type":"application/pdf",
                      "file_size":120
                    }
                  }
                }
                """)).orElseThrow();

        assertEquals("telegram:-100123:55", document.messageId());
        assertEquals("-100123", document.chatId());
        assertEquals("987", document.senderId());
        assertEquals("telegram-file-id", document.fileId());
        assertEquals("BEDAS-2026-teknik-sartname.pdf", document.filename());

        var photo = parser.media(objectMapper.readTree("""
                {
                  "message":{
                    "message_id":56,
                    "chat":{"id":-100123},
                    "photo":[
                      {"file_id":"small","file_size":10},
                      {"file_id":"large","file_size":100}
                    ]
                  }
                }
                """)).orElseThrow();
        assertEquals("large", photo.fileId());
        assertEquals("image/jpeg", photo.mimeType());
    }

    @Test
    void ignoresTextAsMediaAndParsesCommand() throws Exception {
        var update = objectMapper.readTree("""
                {
                  "message":{
                    "message_id":57,
                    "chat":{"id":-100123,"title":"Test"},
                    "text":"/unit"
                  }
                }
                """);
        assertTrue(parser.media(update).isEmpty());
        assertEquals("/unit", parser.textMessage(update).orElseThrow().text());
    }

    @Test
    void parsesCallbackSenderForAuthorization() throws Exception {
        var callback = parser.callback(objectMapper.readTree("""
                {
                  "callback_query":{
                    "id":"callback-1",
                    "from":{"id":987},
                    "data":"unit:MOBIT",
                    "message":{"chat":{"id":-100123,"title":"Test"}}
                  }
                }
                """)).orElseThrow();

        assertEquals("987", callback.senderId());
        assertEquals("-100123", callback.chatId());
    }
}
