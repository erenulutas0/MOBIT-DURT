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
 * <p>Indexing is a sweep rather than a hook on upload, and that is the whole design: one mechanism
 * covers a document that arrived a minute ago, the several hundred already sitting in the archive
 * from before this feature existed, and a re-index after the embedding model changes. Hooking
 * extraction would have handled only the first of those, and would have put a slow embedding call —
 * hundreds of passages for a long şartname — inside a user's HTTP request.
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
    private final int batchSize;

    public DocumentIndexSweeper(
            JdbcTemplate jdbcTemplate,
            DocumentIndexingService indexingService,
            EmbeddingModel embeddingModel,
            @Value("${docsbot.rag.sweep-batch:5}") int batchSize
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.indexingService = indexingService;
        this.embeddingModel = embeddingModel;
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

    /** How much of the archive is still waiting — what an admin needs to see before a demo. */
    public long pendingCount() {
        return jdbcTemplate.queryForObject(
                pendingSql(""), Long.class, embeddingModel.name());
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
