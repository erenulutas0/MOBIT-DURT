package com.docsbot.ops.rag;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Keeps the searchable corpus in step with the document archive.
 *
 * <p>Each pass does both halves of the job: pulls text out of freshly uploaded files, then turns
 * that text into searchable passages. Uploading used to leave a file invisible to search until
 * somebody called the extraction endpoint by hand, which is not something a customer dropping in a
 * şartname should ever have to know about.
 *
 * <p>A sweep rather than a hook on upload, and that is the whole design: one mechanism covers a
 * document that arrived a minute ago, the several hundred already sitting in the archive from
 * before this feature existed, and a re-index after the embedding model changes. A hook would have
 * handled only the first, and would have put slow work — extraction plus hundreds of embeddings for
 * a long şartname — inside a user's HTTP request.
 *
 * <p>Each pass takes a small batch so a cold start spreads its load over minutes instead of pinning
 * the CPU the backend and Piper are sharing.
 */
@Service
@Profile("postgres")
public class DocumentIndexSweeper {

    private static final Logger log = LoggerFactory.getLogger(DocumentIndexSweeper.class);

    private final JdbcTemplate jdbcTemplate;
    private final DocumentIndexingService indexingService;
    private final EmbeddingModel embeddingModel;
    private final com.docsbot.ops.tender.TenderTextExtractionService textExtractionService;
    private final int batchSize;

    public DocumentIndexSweeper(
            JdbcTemplate jdbcTemplate,
            DocumentIndexingService indexingService,
            EmbeddingModel embeddingModel,
            com.docsbot.ops.tender.TenderTextExtractionService textExtractionService,
            @Value("${docsbot.rag.sweep-batch:5}") int batchSize
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.indexingService = indexingService;
        this.embeddingModel = embeddingModel;
        this.textExtractionService = textExtractionService;
        this.batchSize = batchSize;
    }

    @Scheduled(
            fixedDelayString = "${docsbot.rag.sweep-delay-ms:120000}",
            initialDelayString = "${docsbot.rag.sweep-initial-delay-ms:60000}")
    public void sweepScheduled() {
        try {
            sweep();
        } catch (RuntimeException exception) {
            // A sweep that throws must not kill the scheduler for the rest of the process's life.
            log.warn("rag_sweep_failed", exception);
        }
    }

    /** Indexes the next batch of documents that have text but no passages. Returns how many. */
    public int sweep() {
        if (!embeddingModel.available()) {
            // The sidecar is not up yet; try again next pass rather than marking anything failed.
            return 0;
        }
        // Uploading a file used to leave it invisible to search until somebody remembered to call
        // the extraction endpoint by hand. A customer who uploads a şartname expects it to be
        // searchable, so the sweep pulls the text out first and then indexes it — one drop, no steps.
        extractPendingText();
        String model = embeddingModel.name();
        List<Long> pending = pendingDocumentIds(model, batchSize);
        int indexed = 0;
        for (Long documentId : pending) {
            String text = jdbcTemplate.queryForObject(
                    "select extracted_text from documents where id = ?", String.class, documentId);
            try {
                indexingService.index(documentId, text);
                indexed++;
            } catch (RuntimeException exception) {
                // One unreadable document must not stall the queue behind it forever. It will be
                // retried next pass; if it keeps failing that shows up in the logs as a pattern.
                log.warn("rag_index_failed document_id={}", documentId, exception);
            }
        }
        if (indexed > 0) {
            log.info("rag_sweep indexed={} model={}", indexed, model);
        }
        return indexed;
    }

    /**
     * Pulls text out of freshly uploaded files. Only ever attempted once per document: extraction
     * marks the row extracted, failed or unsupported, and this looks for the untouched ones, so a
     * scanned image PDF is not retried on every pass forever.
     */
    private void extractPendingText() {
        List<Long> awaiting = jdbcTemplate.queryForList("""
                select id from documents
                 where extracted_text is null
                   and (text_extraction_status is null or text_extraction_status = 'pending')
                 order by id desc limit ?
                """, Long.class, batchSize);
        for (Long documentId : awaiting) {
            try {
                textExtractionService.extractText(documentId);
            } catch (RuntimeException exception) {
                // Extraction marks its own failures, but only once it has the file in hand — a row
                // whose file is missing entirely throws before that and would stay 'pending',
                // refilling this batch on every pass and starving everything behind it. Mark it
                // here so the queue keeps moving; the log shows the pattern if it is widespread.
                log.warn("rag_extract_failed document_id={} reason={}", documentId, exception.getMessage());
                jdbcTemplate.update(
                        "update documents set text_extraction_status = 'failed' where id = ?", documentId);
            }
        }
    }

    /**
     * Throws the whole index away so the next sweeps rebuild it.
     *
     * <p>A sweep normally skips anything already indexed for the current model, which is right for
     * the everyday case and wrong for the other reason an index goes stale: changing how documents
     * are split into passages leaves every vector valid-looking and every one of them describing the
     * wrong span of text. The model name cannot detect that, and nothing else was able to ask for a
     * rebuild — so an admin can now say so directly.
     *
     * <p>The corpus is unsearchable until the sweeps catch up. That is the honest cost of the
     * operation rather than a defect: rebuilding in place would mean holding both indexes at once.
     */
    public int forgetEverything() {
        int removed = jdbcTemplate.update("delete from erp_document_chunks");
        log.info("rag_index_cleared chunks={}", removed);
        return removed;
    }

    /** How much of the archive is still waiting — what an admin needs to see before a demo. */
    public long pendingCount() {
        return jdbcTemplate.queryForObject(
                pendingSql(""), Long.class, embeddingModel.name());
    }

    /**
     * Documents whose text has not been pulled out yet. Counted separately from {@link
     * #pendingCount()} because that one only sees rows that already hold text: a freshly uploaded
     * file reports as neither indexed nor pending, which reads as "nothing was uploaded" when in
     * fact eight files are sitting one step earlier in the pipeline. Telling those two apart is the
     * whole reason the status endpoint exists.
     */
    public long awaitingTextCount() {
        return jdbcTemplate.queryForObject("""
                select count(*) from documents
                 where extracted_text is null
                   and (text_extraction_status is null or text_extraction_status = 'pending')
                """, Long.class);
    }

    public long indexedDocumentCount() {
        return jdbcTemplate.queryForObject(
                "select count(distinct document_id) from erp_document_chunks where model = ?",
                Long.class, embeddingModel.name());
    }

    private List<Long> pendingDocumentIds(String model, int limit) {
        return jdbcTemplate.queryForList(
                pendingSql("select id from") + " order by id desc limit " + limit, Long.class, model);
    }

    /**
     * Documents holding usable text with no passages for the current model. The model is part of
     * the condition so switching models re-indexes everything rather than mixing vector spaces,
     * where distances are meaningless and ranking is confidently wrong.
     */
    private static String pendingSql(String projection) {
        String select = projection.isEmpty() ? "select count(*) from" : projection;
        return select + """
                 documents document
                 where document.extracted_text is not null
                   and length(trim(document.extracted_text)) > 40
                   and not exists (
                       select 1 from erp_document_chunks chunk
                        where chunk.document_id = document.id
                          and chunk.model = ?)
                """;
    }
}
