package com.docsbot.ops.rag;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private final JdbcTemplate jdbcTemplate;
    /**
     * Below this the question has no answer here at all, and saying so is the right response.
     *
     * <p>Measured, not guessed: against this model, questions with nothing to do with the corpus
     * ("bugün hava nasıl", "kedim neden mama yemiyor") peak at 0.744–0.776, while real answers land
     * at 0.81–0.89. The gap is narrow because e5 similarities are compressed near the top of their
     * range — which is exactly why the first value here, picked by eye at 0.72, sat below the noise
     * and let everything through.
     *
     * <p>Configurable because the number belongs to the model, not to the code: another model has
     * another distribution, and a value carried over unchanged would silently stop filtering.
     */
    private final double minSimilarity;
    /**
     * How far below the best hit a passage may still be shown.
     *
     * <p>The absolute floor decides whether there is an answer; this decides how much of the tail
     * comes with it. Without it a good question returns its answer followed by five plausible-
     * looking clauses about other subjects, all scoring within a few thousandths, and the user has
     * to work out which one was meant.
     */
    private final double relativeWindow;

    public DocumentSearchService(
            DocumentChunkRepository chunkRepository,
            EmbeddingModel embeddingModel,
            JdbcTemplate jdbcTemplate,
            @org.springframework.beans.factory.annotation.Value("${docsbot.rag.min-similarity:0.79}")
            double minSimilarity,
            @org.springframework.beans.factory.annotation.Value("${docsbot.rag.relative-window:0.03}")
            double relativeWindow
    ) {
        this.chunkRepository = chunkRepository;
        this.embeddingModel = embeddingModel;
        this.jdbcTemplate = jdbcTemplate;
        this.minSimilarity = minSimilarity;
        this.relativeWindow = relativeWindow;
    }

    /** A passage that answered the question, with enough context to go and check it. */
    public record Passage(
            long documentId, String documentName, int chunkIndex, String content, double similarity) {
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
                        chunk.getDocumentId(), null, chunk.getChunkIndex(), chunk.getContent(), similarity));
            }
        }
        if (scored.isEmpty()) {
            return List.of();
        }
        scored.sort(Comparator.comparingDouble(Passage::similarity).reversed());
        double cutoff = scored.get(0).similarity() - relativeWindow;
        scored.removeIf(passage -> passage.similarity() < cutoff);
        return withDocumentNames(
                capPerDocument(scored, Math.max(1, Math.min(limit <= 0 ? MAX_RESULTS : limit, MAX_RESULTS))));
    }

    /**
     * Attaches the file each passage came from. A citation nobody can follow is not a citation: for
     * a şartname clause, "05-yeterlik-belgeleri.pdf" is what lets somebody open the file and check
     * the wording, and "document 13" is what makes them stop trusting the answer.
     *
     * <p>Resolved after ranking rather than joined during it, so the lookup covers the handful of
     * passages actually being returned instead of every chunk in the corpus.
     */
    private List<Passage> withDocumentNames(List<Passage> passages) {
        if (passages.isEmpty()) {
            return passages;
        }
        List<Long> ids = passages.stream().map(Passage::documentId).distinct().toList();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        Map<Long, String> names = new java.util.HashMap<>();
        jdbcTemplate.query(
                "select id, original_filename from documents where id in (" + placeholders + ")",
                resultSet -> {
                    names.put(resultSet.getLong("id"), resultSet.getString("original_filename"));
                },
                ids.toArray());
        return passages.stream()
                .map(passage -> new Passage(
                        passage.documentId(),
                        names.get(passage.documentId()),
                        passage.chunkIndex(),
                        passage.content(),
                        passage.similarity()))
                .toList();
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
