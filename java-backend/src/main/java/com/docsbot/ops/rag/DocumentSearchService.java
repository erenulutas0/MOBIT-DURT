package com.docsbot.ops.rag;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.rag.domain.DocumentChunk;
import com.docsbot.ops.rag.infrastructure.DocumentChunkRepository;

/**
 * Answers a question from the company's own documents by finding the passages that mean the same
 * thing — not the ones that happen to share words. "Teminat süresi ne kadar?" finds a clause
 * written as "geçerlilik süresi 120 takvim günüdür", which keyword search never would.
 *
 * <p>It returns the passages themselves with their source, and deliberately does not write a
 * summary over them. For a şartname that is the right product decision, not a missing feature: a
 * quoted clause with its document is auditable and cannot hallucinate, and an answer that carries
 * legal weight has to be checkable. A generated summary can be layered on later — the retrieval
 * below is what it would be built from either way.
 */
@Service
@Profile("postgres")
public class DocumentSearchService {

    private static final int MAX_RESULTS = 8;
    /** One document rarely deserves the whole answer, so a single file cannot crowd the rest out. */
    private static final int MAX_PER_DOCUMENT = 3;

    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingModel embeddingModel;
    /**
     * Below this the match is coincidence, and returning it would train users to distrust the
     * feature. Configurable because every embedding model has its own similarity distribution — a
     * value tuned for one model is meaningless for the next, so hardcoding it would silently break
     * retrieval the day the model changes.
     */
    private final double minSimilarity;

    public DocumentSearchService(
            DocumentChunkRepository chunkRepository,
            EmbeddingModel embeddingModel,
            @org.springframework.beans.factory.annotation.Value("${docsbot.rag.min-similarity:0.72}")
            double minSimilarity
    ) {
        this.chunkRepository = chunkRepository;
        this.embeddingModel = embeddingModel;
        this.minSimilarity = minSimilarity;
    }

    /** A passage that answered the question, with enough context to go and check it. */
    public record Passage(long documentId, int chunkIndex, String content, double similarity) {
    }

    @Transactional(readOnly = true)
    public List<Passage> search(String question, int limit) {
        if (question == null || question.isBlank()) {
            return List.of();
        }
        String model = embeddingModel.name();
        List<DocumentChunk> chunks = chunkRepository.findAllByModel(model);
        if (chunks.isEmpty()) {
            return List.of();
        }
        float[] queryVector = embeddingModel.embedQuery(question);

        List<Passage> scored = new ArrayList<>();
        for (DocumentChunk chunk : chunks) {
            float[] vector = Vectors.unpack(chunk.getEmbedding());
            if (vector.length != queryVector.length) {
                // A leftover from an earlier model that shares its name; skip rather than throw.
                continue;
            }
            double similarity = Vectors.cosineSimilarity(queryVector, vector);
            if (similarity >= minSimilarity) {
                scored.add(new Passage(
                        chunk.getDocumentId(), chunk.getChunkIndex(), chunk.getContent(), similarity));
            }
        }
        scored.sort(Comparator.comparingDouble(Passage::similarity).reversed());
        return capPerDocument(scored, Math.max(1, Math.min(limit <= 0 ? MAX_RESULTS : limit, MAX_RESULTS)));
    }

    /**
     * Keeps the answer spread across sources. Without this a long document with many near-identical
     * clauses fills every slot and hides the one other file that actually mattered.
     */
    private static List<Passage> capPerDocument(List<Passage> ranked, int limit) {
        List<Passage> kept = new ArrayList<>();
        java.util.Map<Long, Integer> perDocument = new java.util.HashMap<>();
        for (Passage passage : ranked) {
            int used = perDocument.getOrDefault(passage.documentId(), 0);
            if (used >= MAX_PER_DOCUMENT) {
                continue;
            }
            kept.add(passage);
            perDocument.put(passage.documentId(), used + 1);
            if (kept.size() >= limit) {
                break;
            }
        }
        return List.copyOf(kept);
    }
}
