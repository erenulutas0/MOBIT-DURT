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
 * The tender brief: the dozen facts a company decides on before bidding, each answered by the clause
 * that states it.
 *
 * <p>The property that matters most is not that it finds answers — it is that it finds them in the
 * right tender. Penalties and thresholds differ per contract, so a clause pulled from a neighbouring
 * şartname reads perfectly and is wrong, which is the worst way for this to fail.
 */
@SpringBootTest(properties = {
        "docsbot.rag.min-similarity=0.15",
        "docsbot.rag.relative-window=1.0",
})
@ActiveProfiles("postgres")
class TenderBriefIntegrationTest {

    @TestConfiguration
    static class StubEmbeddings {
        @Bean
        @Primary
        EmbeddingModel stubEmbeddingModel() {
            return new BagOfWords();
        }
    }

    @Autowired
    private DocumentIndexingService indexingService;

    @Autowired
    private TenderBriefService briefService;

    @Autowired
    private DocumentSearchService searchService;

    @Autowired
    private DocumentChunkRepository chunkRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final String OURS = "BRIEF-OURS-2026";
    private static final String THEIRS = "BRIEF-THEIRS-2026";

    @BeforeEach
    void seed() {
        chunkRepository.deleteAll();
        jdbcTemplate.update("delete from documents where tender_id in (?, ?)", OURS, THEIRS);
        jdbcTemplate.update("delete from tenders where tender_id in (?, ?)", OURS, THEIRS);
        insertTender(OURS);
        insertTender(THEIRS);
    }

    @Test
    void theBriefAnswersFromTheTenderBeingLookedAtNotTheArchive() {
        indexingService.index(insertDocument(OURS, "bizim-sartname.pdf"),
                "MADDE 1 - GECIKME CEZASI\nIsi gec bitirirsem gecikilen her gun icin binde iki ceza oderim.");
        indexingService.index(insertDocument(THEIRS, "baska-sartname.pdf"),
                "MADDE 1 - GECIKME CEZASI\nIsi gec bitirirsem gecikilen her gun icin yuzde bir ceza oderim.");

        String ours = contentOf(briefService.brief(OURS), "gecikme_cezasi");
        String theirs = contentOf(briefService.brief(THEIRS), "gecikme_cezasi");

        // Both documents answer the question equally well. Scoping is the only thing keeping the
        // neighbouring tender's penalty out of this one's brief, and that clause reads perfectly.
        assertThat(ours).contains("binde iki").doesNotContain("yuzde bir");
        assertThat(theirs).contains("yuzde bir").doesNotContain("binde iki");
    }

    @Test
    void everyQuestionIsReportedEvenWhenTheDocumentsDoNotAnswerIt() {
        indexingService.index(insertDocument(OURS, "kisa-sartname.pdf"),
                "MADDE 1 - GECIKME CEZASI\nIsi gec bitirirsem gecikilen her gun icin binde iki ceza oderim.");

        List<TenderBriefService.Entry> brief = briefService.brief(OURS);

        // "Bu şartnamede fiyat farkı hükmü yok" is a finding worth having before bidding. A brief
        // that quietly drops what it could not find looks complete when it is not.
        assertThat(brief).hasSizeGreaterThanOrEqualTo(10);
        assertThat(brief).anySatisfy(entry -> assertThat(entry.found()).isFalse());
        assertThat(brief).allSatisfy(entry -> {
            assertThat(entry.label()).isNotBlank();
            assertThat(entry.question()).isNotBlank();
        });
    }

    @Test
    void aTenderWithNoIndexedDocumentsGivesAnEmptyBriefRatherThanTheArchivesAnswers() {
        indexingService.index(insertDocument(THEIRS, "baska-sartname.pdf"),
                "MADDE 1 - GECIKME CEZASI\nIsi gec bitirirsem gecikilen her gun icin yuzde bir ceza oderim.");

        List<TenderBriefService.Entry> brief = briefService.brief(OURS);

        assertThat(brief).allSatisfy(entry -> assertThat(entry.found()).isFalse());
    }

    @Test
    void anUnscopedSearchStillSeesTheWholeArchive() {
        indexingService.index(insertDocument(OURS, "bizim-sartname.pdf"),
                "MADDE 1 - GECIKME CEZASI\nIsi gec bitirirsem gecikilen her gun icin binde iki ceza oderim.");

        // The scoping is an added option, not a change to what asking without a tender means.
        assertThat(searchService.search("gecikme cezasi gec bitirirsem", 5)).isNotEmpty();
    }

    private static String contentOf(List<TenderBriefService.Entry> brief, String key) {
        return brief.stream()
                .filter(entry -> entry.key().equals(key))
                .findFirst()
                .map(entry -> entry.passage() == null ? "" : entry.passage().content())
                .orElse("");
    }

    private void insertTender(String tenderId) {
        jdbcTemplate.update("""
                insert into tenders (tender_id, organization, year, sequence, status)
                values (?, 'TEST', 2026, 1, 'active')
                on conflict (tender_id) do nothing
                """, tenderId);
    }

    private long insertDocument(String tenderId, String filename) {
        String unique = filename + "-" + System.nanoTime();
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id,
                     original_filename, tender_id, document_type, status)
                values (?, 'test-hash', 'test', now(), ?, ?, ?, 'sartname', 'received')
                """, unique, unique, filename, tenderId);
        return jdbcTemplate.queryForObject(
                "select id from documents where message_id = ?", Long.class, unique);
    }

    /** Same deterministic stand-in used across the RAG tests: shared words point the same way. */
    private static final class BagOfWords implements EmbeddingModel {
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
            return passages.stream().map(BagOfWords::vectorFor).toList();
        }

        @Override
        public float[] embedQuery(String query) {
            return vectorFor(query);
        }

        private static float[] vectorFor(String text) {
            float[] vector = new float[DIMENSIONS];
            for (String word : text.toLowerCase(java.util.Locale.ROOT).split("\\W+")) {
                if (word.length() >= 3) {
                    vector[Math.floorMod(word.hashCode(), DIMENSIONS)] += 1f;
                }
            }
            return vector;
        }
    }
}
