package com.docsbot.ops.tender;

import java.io.InputStream;
import java.time.Instant;
import java.util.Locale;

import org.apache.tika.io.TikaInputStream;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.metadata.TikaCoreProperties;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class TenderTextExtractionService {

    private static final int MAX_STORED_TEXT_CHARS = 1_000_000;

    /** Below this a document has no searchable text, whatever the extractor thought. */
    private static final int USABLE_TEXT_CHARS = 40;

    private final TenderDocumentRepository documentRepository;
    private final DashboardFileService fileService;
    private final com.docsbot.ops.rag.OcrClient ocrClient;
    private final AutoDetectParser parser = new AutoDetectParser();

    public TenderTextExtractionService(
            TenderDocumentRepository documentRepository,
            DashboardFileService fileService,
            com.docsbot.ops.rag.OcrClient ocrClient
    ) {
        this.documentRepository = documentRepository;
        this.fileService = fileService;
        this.ocrClient = ocrClient;
    }

    @Transactional
    public TenderDocument extractText(long documentId) {
        TenderDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
        DashboardFileService.StoredFile file = fileService.documentFile(documentId);
        Instant now = Instant.now();
        if (!supported(file)) {
            // A photograph of a page is not "unsupported" once there is something that can read
            // it; only give up when OCR is off or has nothing to say either.
            String scanned = ocrClient.read(file.path(), file.filename());
            if (scanned.length() >= USABLE_TEXT_CHARS) {
                document.markTextExtracted(scanned, now);
                return documentRepository.saveAndFlush(document);
            }
            document.markTextExtractionUnsupported(
                    "File type is not supported for text extraction",
                    now);
            return documentRepository.saveAndFlush(document);
        }
        try {
            String extracted = parse(file);
            if (extracted.length() < USABLE_TEXT_CHARS) {
                // A PDF with no text layer parses perfectly and yields nothing. Marking that
                // 'extracted' is how a third of this archive came to sit in it answering no
                // questions while looking complete.
                String scanned = ocrClient.read(file.path(), file.filename());
                if (scanned.length() >= USABLE_TEXT_CHARS) {
                    extracted = scanned;
                }
            }
            document.markTextExtracted(extracted, now);
        } catch (Exception exception) {
            document.markTextExtractionFailed(exception.getMessage(), now);
        }
        return documentRepository.saveAndFlush(document);
    }

    private String parse(DashboardFileService.StoredFile file) throws Exception {
        Metadata metadata = new Metadata();
        metadata.set(TikaCoreProperties.RESOURCE_NAME_KEY, file.filename());
        metadata.set(Metadata.CONTENT_TYPE, file.contentType());
        BodyContentHandler handler = new BodyContentHandler(-1);
        try (InputStream stream = TikaInputStream.get(file.path(), metadata)) {
            parser.parse(stream, handler, metadata, new ParseContext());
        }
        String normalized = normalizeText(handler.toString());
        return normalized.substring(0, Math.min(normalized.length(), MAX_STORED_TEXT_CHARS));
    }

    private boolean supported(DashboardFileService.StoredFile file) {
        String contentType = file.contentType() == null
                ? ""
                : file.contentType().toLowerCase(Locale.ROOT);
        String filename = file.filename() == null
                ? ""
                : file.filename().toLowerCase(Locale.ROOT);
        return contentType.equals("application/pdf")
                || contentType.equals("application/msword")
                || contentType.equals("application/vnd.ms-excel")
                || contentType.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                || contentType.equals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                || contentType.startsWith("text/")
                || filename.endsWith(".pdf")
                || filename.endsWith(".doc")
                || filename.endsWith(".docx")
                || filename.endsWith(".xls")
                || filename.endsWith(".xlsx")
                || filename.endsWith(".txt")
                || filename.endsWith(".csv");
    }

    private String normalizeText(String value) {
        if (value == null || value.isBlank()) return "";
        return value
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .replaceAll("[ \\t\\x0B\\f]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }
}
