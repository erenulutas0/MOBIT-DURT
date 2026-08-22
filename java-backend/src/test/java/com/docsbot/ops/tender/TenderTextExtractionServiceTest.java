package com.docsbot.ops.tender;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;

import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.rag.OcrClient;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * What "extracted" is allowed to mean.
 *
 * <p>A PDF with no text layer parses perfectly and yields nothing; OCR is the rescue. When the
 * rescue does not arrive — it timed out, refused the size, or is switched off — the document used
 * to be stored as extracted anyway. It then read as done, held nothing, answered no question ever
 * asked of it, and appeared in no failure count, so nobody was ever told to go and look at it.
 */
class TenderTextExtractionServiceTest {

    private static final String REAL_TEXT =
            "Bu şartnamenin konusu Konya ili köy yollarında asfalt kaplama yapım işidir.";

    private final TenderDocumentRepository documentRepository = mock(TenderDocumentRepository.class);
    private final DashboardFileService fileService = mock(DashboardFileService.class);
    private final OcrClient ocrClient = mock(OcrClient.class);

    private final TenderTextExtractionService service =
            new TenderTextExtractionService(documentRepository, fileService, ocrClient);

    @Test
    void aDocumentOcrCouldNotReadIsAFailureRatherThanAnEmptySuccess(@TempDir Path folder)
            throws IOException {
        TenderDocument document = given(folder, "kisa", "");

        service.extractText(1L);

        assertThat(document.getTextExtractionStatus()).isEqualTo("failed");
        assertThat(document.getTextExtractionError()).contains("OCR");
        // Nothing kept: a handful of characters is not searchable content, and storing them would
        // only make the row look like it holds something.
        assertThat(document.getExtractedText()).isNull();
    }

    @Test
    void ocrRescuingAScannedPageStillCountsAsExtracted(@TempDir Path folder) throws IOException {
        TenderDocument document = given(folder, "kisa", REAL_TEXT);

        service.extractText(1L);

        assertThat(document.getTextExtractionStatus()).isEqualTo("extracted");
        assertThat(document.getExtractedText()).isEqualTo(REAL_TEXT);
    }

    @Test
    void aDocumentThatParsesOnItsOwnNeverReachesOcr(@TempDir Path folder) throws IOException {
        TenderDocument document = given(folder, REAL_TEXT, "OCR bunu okumamali");

        service.extractText(1L);

        assertThat(document.getTextExtractionStatus()).isEqualTo("extracted");
        assertThat(document.getExtractedText()).contains("asfalt kaplama");
    }

    /** A supported file whose own text is {@code fileText}, with OCR standing by to return {@code ocrText}. */
    private TenderDocument given(Path folder, String fileText, String ocrText) throws IOException {
        Path file = folder.resolve("sartname.txt");
        Files.writeString(file, fileText);
        TenderDocument document = TenderDocument.ingested(
                "m-1", "hash", "test", Instant.parse("2026-08-22T06:00:00Z"), "media-1",
                "text/plain", "sartname.txt", "sartname.txt", null, "sum",
                file.toString(), Files.size(file), null, "Mobit", 2026, "2026/1", "sartname", "new");
        when(documentRepository.findById(1L)).thenReturn(Optional.of(document));
        when(documentRepository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(fileService.documentFile(1L))
                .thenReturn(new DashboardFileService.StoredFile(file, "text/plain", "sartname.txt"));
        when(ocrClient.read(any(), anyString())).thenReturn(ocrText);
        return document;
    }
}
