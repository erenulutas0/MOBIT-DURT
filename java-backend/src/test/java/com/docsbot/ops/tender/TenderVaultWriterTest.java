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

    @Test
    void writeExtractionResultsRendersFactsSummaryAndRiskThenReplacesOnRerun() throws Exception {
        DocsBotProperties properties = mock(DocsBotProperties.class);
        when(properties.vaultDir()).thenReturn(vaultDir.toString());
        TenderVaultWriter writer = new TenderVaultWriter(properties);

        TenderDocument document = TenderDocument.ingested(
                "msg-2",
                "hash2",
                "telegram",
                Instant.parse("2026-07-09T10:00:00Z"),
                "media-2",
                "application/pdf",
                "Teknik Şartname.pdf",
                "teknik-sartname2.pdf",
                null,
                "abcdef987654",
                "2026/MOBIT/BEDAS/x/teknik-sartname2.pdf",
                1234L,
                "Mobit",
                "BEDAŞ",
                2026,
                "BEDAS-2026-002",
                "technical_spec",
                "stored");
        writer.writeDocument(document);

        document.markFactsExtracted(
                "{\"deadline_candidates\":[{\"normalized\":\"2026-08-01\"}],"
                        + "\"money_amounts\":[{\"amount\":\"50000\",\"currency\":\"TRY\"}],"
                        + "\"emails\":[\"ihale@bedas.com.tr\"]}",
                Instant.now());
        document.markAiSummaryGenerated(
                "{\"headline\":\"BEDAŞ için teknik şartname özeti\",\"overview\":\"Genel bakış metni.\","
                        + "\"key_points\":[\"İhale: BEDAS-2026-002\",\"Kurum: BEDAŞ\"]}",
                Instant.now());
        document.markAiRiskGenerated(
                "{\"risk_level\":\"medium\",\"risk_score\":25,\"risks\":[{\"severity\":\"medium\","
                        + "\"title\":\"Son tarih adayı tespit edildi\",\"evidence\":\"Belgede tarih var.\","
                        + "\"recommendation\":\"Deadline'ı doğrulayın.\"}]}",
                Instant.now());

        writer.writeExtractionResults(document);

        Path documentNote = vaultDir.resolve(Path.of(
                "ihaleler", "2026", "MOBIT", "BEDAS", "BEDAS-2026-002", "documents",
                "teknik-sartname2-abcdef9876.md"));
        String firstPass = Files.readString(documentNote);
        assertThat(firstPass).contains("<!-- AUTO:EXTRACTION:START -->");
        assertThat(firstPass).contains("BEDAŞ için teknik şartname özeti");
        assertThat(firstPass).contains("Risk Analizi — seviye: medium (skor 25)");
        assertThat(firstPass).contains("Son tarih adayı tespit edildi");
        assertThat(firstPass).contains("Olası son tarihler: 2026-08-01");
        assertThat(firstPass).contains("Tutarlar: 50000 TRY");
        assertThat(firstPass).contains("ihale@bedas.com.tr");

        // Re-running with updated risk data replaces the block in place — no duplication.
        document.markAiRiskGenerated(
                "{\"risk_level\":\"low\",\"risk_score\":5,\"risks\":[]}",
                Instant.now());
        writer.writeExtractionResults(document);
        String secondPass = Files.readString(documentNote);
        assertThat(secondPass).contains("Risk Analizi — seviye: low (skor 5)");
        assertThat(secondPass).doesNotContain("seviye: medium (skor 25)");
        int occurrences = secondPass.split("AUTO:EXTRACTION:START", -1).length - 1;
        assertThat(occurrences).isEqualTo(1);
    }
}
