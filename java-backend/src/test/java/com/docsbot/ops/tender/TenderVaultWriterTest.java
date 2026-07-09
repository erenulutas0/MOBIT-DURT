package com.docsbot.ops.tender;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.tender.domain.TenderDocument;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenderVaultWriterTest {

    @TempDir
    Path vaultDir;

    @Test
    void vaultSegmentTransliteratesTurkishCharactersToOneCanonicalDirectory() {
        assertThat(TenderVaultWriter.vaultSegment("BEDAŞ")).isEqualTo("BEDAS");
        assertThat(TenderVaultWriter.vaultSegment("BEDAS")).isEqualTo("BEDAS");
        assertThat(TenderVaultWriter.vaultSegment("İGDAŞ")).isEqualTo("IGDAS");
        assertThat(TenderVaultWriter.vaultSegment("Stok Enerji")).isEqualTo("STOK_ENERJI");
        assertThat(TenderVaultWriter.vaultSegment("unclassified")).isEqualTo("UNCLASSIFIED");
        assertThat(TenderVaultWriter.vaultSegment(null)).isEqualTo("UNCLASSIFIED");
        assertThat(TenderVaultWriter.vaultSegment("  ")).isEqualTo("UNCLASSIFIED");
        assertThat(TenderVaultWriter.vaultSegment("Çöğüş-Ltd.")).isEqualTo("COGUS_LTD");
    }

    @Test
    void writeDocumentUsesCanonicalSegmentsAndTaggedTemplates() throws Exception {
        DocsBotProperties properties = mock(DocsBotProperties.class);
        when(properties.vaultDir()).thenReturn(vaultDir.toString());
        TenderVaultWriter writer = new TenderVaultWriter(properties);

        writer.writeDocument(TenderDocument.ingested(
                "msg-1",
                "hash",
                "telegram",
                Instant.parse("2026-07-09T10:00:00Z"),
                "media-1",
                "application/pdf",
                "Teknik Şartname.pdf",
                "teknik-sartname.pdf",
                null,
                "abcdef012345",
                "2026/MOBIT/BEDAS/x/teknik-sartname.pdf",
                1234L,
                "Mobit",
                "BEDAŞ",
                2026,
                "BEDAS-2026-001",
                "technical_spec",
                "stored"));

        Path tenderNote = vaultDir.resolve(
                Path.of("ihaleler", "2026", "MOBIT", "BEDAS", "BEDAS-2026-001", "BEDAS-2026-001.md"));
        assertThat(tenderNote).exists();
        String tenderContent = Files.readString(tenderNote);
        assertThat(tenderContent).contains("tags: [tender, mobit, bedas]");
        assertThat(tenderContent).contains("organization: BEDAŞ");

        Path documentsDir = tenderNote.getParent().resolve("documents");
        try (var notes = Files.list(documentsDir)) {
            Path documentNote = notes.filter(path -> path.toString().endsWith(".md")).findFirst().orElseThrow();
            String documentContent = Files.readString(documentNote);
            assertThat(documentContent).contains("tags: [document, technical_spec, mobit, bedas]");
            assertThat(documentContent).contains("internal_unit: Mobit");
            assertThat(documentContent).contains("year: 2026");
        }
    }
}
