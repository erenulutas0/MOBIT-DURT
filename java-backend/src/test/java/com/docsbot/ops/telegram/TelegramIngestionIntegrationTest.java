package com.docsbot.ops.telegram;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.docsbot.ops.telegram.TelegramGateway.DownloadedFile;
import com.docsbot.ops.tender.domain.TenderOrganization;
import com.docsbot.ops.tender.infrastructure.TenderOrganizationRepository;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest
@ActiveProfiles("postgres")
class TelegramIngestionIntegrationTest {

    @Autowired
    private TelegramUpdateProcessor processor;

    @Autowired
    private TenderOrganizationRepository organizationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private TelegramGateway gateway;

    @BeforeEach
    void clean() throws Exception {
        jdbcTemplate.update("delete from documents");
        jdbcTemplate.update("delete from telegram_chat_bindings");
        jdbcTemplate.update("delete from telegram_chat_setups");
        jdbcTemplate.update("delete from tenders");
        jdbcTemplate.update("delete from tender_organizations");
        deleteTree(Path.of("target", "test-data"));
        deleteTree(Path.of("target", "test-vault"));
        reset(gateway);
    }

    @Test
    void unitCompanyAndDocumentFlowUsesJavaPipeline() throws Exception {
        TenderOrganization organization = organizationRepository.saveAndFlush(
                TenderOrganization.active("BEDAS", "BEDAS"));

        processor.process(objectMapper.readTree("""
                {
                  "callback_query":{
                    "id":"callback-unit",
                    "data":"unit:MOBIT",
                    "message":{"chat":{"id":-100123,"title":"BEDAS İhale"}}
                  }
                }
                """));
        assertEquals(
                "MOBIT",
                jdbcTemplate.queryForObject(
                        "select internal_unit from telegram_chat_setups where chat_id='-100123'",
                        String.class));

        processor.process(objectMapper.readTree("""
                {
                  "callback_query":{
                    "id":"callback-company",
                    "data":"orgsel:%d",
                    "message":{"chat":{"id":-100123,"title":"BEDAS İhale"}}
                  }
                }
                """.formatted(organization.getId())));
        String tenderId = jdbcTemplate.queryForObject(
                "select tender_id from telegram_chat_bindings where chat_id='-100123'",
                String.class);
        assertTrue(tenderId.matches("BEDAS-\\d{4}-\\d{8}-001"));

        byte[] pdf = "%PDF-1.7\nTelegram technical specification"
                .getBytes(StandardCharsets.UTF_8);
        when(gateway.downloadFile("telegram-file-id", (long) pdf.length))
                .thenReturn(new DownloadedFile(pdf, "application/pdf"));

        var mediaUpdate = objectMapper.readTree("""
                {
                  "update_id":9,
                  "message":{
                    "message_id":55,
                    "date":1780300800,
                    "chat":{"id":-100123,"title":"BEDAS İhale"},
                    "from":{"id":987},
                    "caption":"Teknik şartname",
                    "document":{
                      "file_id":"telegram-file-id",
                      "file_name":"BEDAS-teknik-sartname.pdf",
                      "mime_type":"application/pdf",
                      "file_size":%d
                    }
                  }
                }
                """.formatted(pdf.length));
        processor.process(mediaUpdate);
        processor.process(mediaUpdate);

        assertEquals(
                1,
                jdbcTemplate.queryForObject(
                        "select count(*) from documents where message_id='telegram:-100123:55'",
                        Integer.class));
        String filePath = jdbcTemplate.queryForObject(
                "select file_path from documents where message_id='telegram:-100123:55'",
                String.class);
        assertTrue(Files.isRegularFile(
                Path.of("target", "test-data").resolve(filePath)));
        Path tenderNote = Path.of(
                "target", "test-vault", "ihaleler",
                tenderId.substring(tenderId.indexOf('-') + 1, tenderId.indexOf('-') + 5),
                "MOBIT", "BEDAS", tenderId, tenderId + ".md");
        assertTrue(Files.isRegularFile(tenderNote));

        verify(gateway, times(1)).downloadFile("telegram-file-id", (long) pdf.length);
        verify(gateway, atLeastOnce()).sendMessage(
                eq("-100123"),
                contains("Doküman kaydedildi"));
    }

    @Test
    void searchesOrganizationsAndOnlyAllowsAdministratorsToAddOne() throws Exception {
        organizationRepository.saveAndFlush(
                TenderOrganization.active("BEDAS", "BEDAS Elektrik"));

        processor.process(objectMapper.readTree("""
                {
                  "message":{
                    "message_id":1,
                    "chat":{"id":-100123,"title":"İhale"},
                    "from":{"id":987},
                    "text":"/company_search bedas"
                  }
                }
                """));
        verify(gateway).sendMessage(
                eq("-100123"),
                eq("Arama sonuçları:"),
                argThat(markup -> ((Map<?, ?>) markup).containsKey("inline_keyboard")));

        when(gateway.isChatAdministrator("-100123", "987")).thenReturn(false, true);
        var addUpdate = objectMapper.readTree("""
                {
                  "message":{
                    "message_id":2,
                    "chat":{"id":-100123,"title":"İhale"},
                    "from":{"id":987},
                    "text":"/company_add Yeni Kamu Kurumu"
                  }
                }
                """);
        processor.process(addUpdate);
        assertTrue(organizationRepository.findByCode("YENI_KAMU_KURUMU").isEmpty());

        processor.process(addUpdate);
        assertTrue(organizationRepository.findByCode("YENI_KAMU_KURUMU").isPresent());
        verify(gateway).sendMessage(
                "-100123",
                "Şirket kataloğa eklendi: Yeni Kamu Kurumu");
    }

    private void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (Exception exception) {
                    throw new RuntimeException(exception);
                }
            });
        }
    }
}
