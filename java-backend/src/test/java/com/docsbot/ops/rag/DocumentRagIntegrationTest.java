package com.docsbot.ops.rag;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.docsbot.ops.rag.infrastructure.DocumentChunkRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The retrieval half of the document assistant, end to end against a real database.
 *
 * <p>The embedding model is stubbed with a deterministic bag-of-words vector rather than the real
 * sidecar: the pipeline being tested is chunk → embed → store → rank → cite, and pinning it to a
 * downloaded neural model would make the suite slow, network-dependent, and quietly re-testing
 * someone else's weights instead of this code.
 */
// The stub embedder is a bag of words, whose similarities sit far below what a neural model
// produces, so the relevance floor is lowered to match it. Production keeps its own default. The
// relative window is opened wide for the same reason: bag-of-words scores are spread across the
// whole range, where a neural model's crowd into a narrow band, so production's 0.03 would cut
// everything but the top hit here and would be testing the stub rather than the code.
@SpringBootTest(properties = {
        "docsbot.rag.min-similarity=0.15",
        "docsbot.rag.relative-window=1.0",
})
@ActiveProfiles("postgres")
class DocumentRagIntegrationTest {

    @TestConfiguration
    static class StubEmbeddings {
        @Bean
        @Primary
        EmbeddingModel stubEmbeddingModel() {
            return new BagOfWordsEmbeddingModel();
        }
    }

    @Autowired
    private DocumentIndexingService indexingService;

    @Autowired
    private DocumentSearchService searchService;

    @Autowired
    private DocumentChunkRepository chunkRepository;

    @Autowired
    private EmbeddingModel embeddingModel;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private long teminatDocumentId;
    private long isProgramiDocumentId;

    @BeforeEach
    void seedDocuments() {
        chunkRepository.deleteAll();
        teminatDocumentId = insertDocument("teminat-sartnamesi.pdf");
        isProgramiDocumentId = insertDocument("is-programi.pdf");
    }

    @Test
    void aQuestionFindsThePassageThatAnswersItAndSaysWhereItCameFrom() {
        indexingService.index(teminatDocumentId, """
                Teminat mektubu ihale tarihinden itibaren en az yuz yirmi takvim gunu gecerli olmalidir.

                Yuklenici ise baslama tarihinden itibaren on bes gun icinde is programi sunar.
                """);

        List<DocumentSearchService.Passage> hits = searchService.search("teminat mektubu gecerlilik", 5);

        assertThat(hits).isNotEmpty();
        assertThat(hits.get(0).content()).contains("Teminat mektubu");
        // The citation is the point: the answer has to be checkable in the source file.
        assertThat(hits.get(0).documentId()).isEqualTo(teminatDocumentId);
        assertThat(hits.get(0).similarity()).isGreaterThan(0.15);
    }

    @Test
    void reIndexingReplacesAdocumentsPassagesRatherThanAppending() {
        indexingService.index(teminatDocumentId, "Teminat mektubu yuz yirmi gun gecerli olmalidir ve saklanir.");
        long afterFirst = chunkRepository.count();

        indexingService.index(teminatDocumentId, "Teminat mektubu yuz yirmi gun gecerli olmalidir ve saklanir.");

        assertThat(chunkRepository.count()).isEqualTo(afterFirst);
    }

    @Test
    void aDocumentWithNoExtractableTextIsSkippedRatherThanFailing() {
        // An image-only PDF: extraction produced nothing. Normal outcome, not an error.
        assertThat(indexingService.index(teminatDocumentId, "   ")).isZero();
        assertThat(indexingService.isIndexed(teminatDocumentId)).isFalse();
    }

    @Test
    void anIrrelevantQuestionReturnsNothingRatherThanTheClosestWrongAnswer() {
        indexingService.index(teminatDocumentId, "Teminat mektubu yuz yirmi takvim gunu gecerli olmalidir.");

        // Confidently returning an unrelated clause is how users learn to distrust the feature.
        assertThat(searchService.search("kahvalti menusu tavuk salata", 5)).isEmpty();
    }

    @Test
    void oneLongDocumentCannotCrowdOutTheOtherSources() {
        // Many near-identical clauses in one file, one clause in another.
        indexingService.index(teminatDocumentId, ("Teminat mektubu suresi uzatilir ve gecerli kalir. \n\n").repeat(12));
        indexingService.index(isProgramiDocumentId, "Teminat mektubu suresi is programinda ayrica belirtilir.");

        List<DocumentSearchService.Passage> hits = searchService.search("teminat mektubu suresi", 8);

        assertThat(hits.stream().map(DocumentSearchService.Passage::documentId).distinct())
                .contains(isProgramiDocumentId);
        assertThat(hits.stream().filter(hit -> hit.documentId() == teminatDocumentId).count())
                .isLessThanOrEqualTo(3);
    }

    @Test
    void theAnswerNamesTheFileItCameFromNotJustAnId() {
        indexingService.index(teminatDocumentId, "Teminat mektubu yuz yirmi takvim gunu gecerli olmalidir.");

        List<DocumentSearchService.Passage> hits = searchService.search("teminat mektubu gecerlilik", 5);

        // A citation nobody can follow is not a citation. "teminat-sartnamesi.pdf" is what lets
        // somebody open the file and check the wording; "document 13" is what makes them stop
        // trusting the answer.
        assertThat(hits).isNotEmpty();
        assertThat(hits.get(0).documentName()).isEqualTo("teminat-sartnamesi.pdf");
    }

    @Test
    void theTailOfWeakerMatchesIsTrimmedRatherThanShownAlongsideTheAnswer() {
        indexingService.index(teminatDocumentId, "Teminat mektubu gecerlilik suresi uzatilabilir.");
        indexingService.index(isProgramiDocumentId, "Yemekhane menusu haftalik olarak teminat panosuna asilir.");

        // Same corpus, same question, two windows. Wide: both come back, because both share a word
        // with the question. Narrow: only the one that actually answers it survives.
        DocumentSearchService narrow = new DocumentSearchService(
                chunkRepository, embeddingModel, jdbcTemplate, 0.15, 0.05);

        assertThat(searchService.search("teminat mektubu gecerlilik suresi", 8))
                .extracting(DocumentSearchService.Passage::documentId)
                .contains(isProgramiDocumentId);
        assertThat(narrow.search("teminat mektubu gecerlilik suresi", 8))
                .extracting(DocumentSearchService.Passage::documentId)
                .containsExactly(teminatDocumentId);
    }

    @Test
    void forgettingAdocumentRemovesItFromAnswers() {
        indexingService.index(teminatDocumentId, "Teminat mektubu yuz yirmi takvim gunu gecerli olmalidir.");
        indexingService.forget(teminatDocumentId);

        assertThat(searchService.search("teminat mektubu", 5)).isEmpty();
    }

    private long insertDocument(String filename) {
        // message_id / media_id / sender_hash carry NOT NULL from the original ingestion schema.
        String unique = filename + "-" + System.nanoTime();
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id,
                     original_filename, tender_id, document_type, status)
                values (?, 'test-hash', 'test', now(), ?, ?, 'TEST-2026-1', 'sartname', 'received')
                """, unique, unique, filename);
        return jdbcTemplate.queryForObject(
                "select id from documents where message_id = ?", Long.class, unique);
    }

    /**
     * Deterministic stand-in for the real model: each distinct word gets a fixed slot, so texts
     * sharing vocabulary point in similar directions. Enough to exercise ranking, thresholds and
     * per-document capping without downloading weights.
     */
    private static final class BagOfWordsEmbeddingModel implements EmbeddingModel {
        private static final int DIMENSIONS = 64;

        @Override
        public String name() {
            return "test-bag-of-words";
        }

        @Override
        public int dimensions() {
            return DIMENSIONS;
        }

        @Override
        public boolean available() {
            return true;
        }

        @Override
        public List<float[]> embedAll(List<String> passages) {
            return passages.stream().map(BagOfWordsEmbeddingModel::vectorFor).toList();
        }

        @Override
        public float[] embedQuery(String query) {
            return vectorFor(query);
        }

        private static float[] vectorFor(String text) {
            float[] vector = new float[DIMENSIONS];
            for (String word : text.toLowerCase(java.util.Locale.ROOT).split("\\W+")) {
                if (word.length() < 3) {
                    continue;
                }
                vector[Math.floorMod(word.hashCode(), DIMENSIONS)] += 1f;
            }
            return vector;
        }
    }
}
