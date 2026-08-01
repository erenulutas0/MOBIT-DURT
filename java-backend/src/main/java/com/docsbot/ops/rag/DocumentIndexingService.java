package com.docsbot.ops.rag;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.rag.domain.DocumentChunk;
import com.docsbot.ops.rag.infrastructure.DocumentChunkRepository;

/**
 * Turns a document's extracted text into searchable passages.
 *
 * <p>Indexing is idempotent per document: re-indexing replaces that document's passages wholesale
 * rather than appending, so a re-extracted or corrected file does not leave stale text answering
 * questions alongside the new version.
 */
@Service
@Profile("postgres")
public class DocumentIndexingService {

    private static final Logger log = LoggerFactory.getLogger(DocumentIndexingService.class);
    /** Keeps one document's embedding call off the sidecar for minutes at a time. */
    private static final int EMBED_BATCH = 32;

    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingModel embeddingModel;
    private final TextChunker chunker;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public DocumentIndexingService(DocumentChunkRepository chunkRepository, EmbeddingModel embeddingModel) {
        this(chunkRepository, embeddingModel, new TextChunker(), Clock.systemUTC());
    }

    DocumentIndexingService(
            DocumentChunkRepository chunkRepository,
            EmbeddingModel embeddingModel,
            TextChunker chunker,
            Clock clock
    ) {
        this.chunkRepository = chunkRepository;
        this.embeddingModel = embeddingModel;
        this.chunker = chunker;
        this.clock = clock;
    }

    /**
     * Indexes one document's text. Returns the number of passages stored — zero means there was
     * nothing worth indexing (an image-only PDF whose extraction produced no text, say), which is a
     * normal outcome and not a failure.
     */
    @Transactional
    public int index(long documentId, String extractedText) {
        List<String> passages = chunker.chunk(extractedText);
        chunkRepository.deleteByDocumentId(documentId);
        if (passages.isEmpty()) {
            return 0;
        }
        String model = embeddingModel.name();
        Instant now = clock.instant();
        List<DocumentChunk> chunks = new ArrayList<>(passages.size());
        int chunkIndex = 0;
        for (int start = 0; start < passages.size(); start += EMBED_BATCH) {
            List<String> batch = passages.subList(start, Math.min(passages.size(), start + EMBED_BATCH));
            List<float[]> vectors = embeddingModel.embedAll(batch);
            for (int offset = 0; offset < batch.size(); offset++) {
                float[] vector = vectors.get(offset);
                chunks.add(DocumentChunk.create(
                        documentId,
                        chunkIndex++,
                        batch.get(offset),
                        Vectors.pack(vector),
                        vector.length,
                        model,
                        now));
            }
        }
        chunkRepository.saveAll(chunks);
        log.info("rag_indexed document_id={} passages={} model={}", documentId, chunks.size(), model);
        return chunks.size();
    }

    @Transactional
    public void forget(long documentId) {
        chunkRepository.deleteByDocumentId(documentId);
    }

    @Transactional(readOnly = true)
    public boolean isIndexed(long documentId) {
        return chunkRepository.existsByDocumentId(documentId);
    }
}
