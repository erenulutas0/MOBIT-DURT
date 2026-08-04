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
 * The sweep is what connects the engine to the fuel: without it the corpus stays empty and every
 * question answers "bulamadım". It is a sweep rather than an upload hook so one mechanism covers a
 * document that arrived a minute ago, the archive that predates the feature, and a re-index after
 * the model changes.
 */
@SpringBootTest(properties = {
        "docsbot.rag.min-similarity=0.15",
        "docsbot.rag.sweep-batch=2",
})
@ActiveProfiles("postgres")
class DocumentIndexSweeperTest {

    @TestConfiguration
    static class StubEmbeddings {
        @Bean
        @Primary
        EmbeddingModel stubEmbeddingModel() {
            return new SwitchableEmbeddingModel();
        }
    }

    @Autowired
    private DocumentIndexSweeper sweeper;

    @Autowired
    private DocumentChunkRepository chunkRepository;

    @Autowired
    private EmbeddingModel embeddingModel;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @org.springframework.beans.factory.annotation.Value("${docsbot.data-dir}")
    private String dataDir;

    @BeforeEach
    void reset() {
        chunkRepository.deleteAll();
        jdbcTemplate.update("delete from documents where message_id like 'sweep-%'");
        ((SwitchableEmbeddingModel) embeddingModel).up = true;
    }

    @Test
    void documentsWithTextButNoPassagesGetIndexed() {
        long documentId = insertDocument("Teminat mektubu yuz yirmi takvim gunu gecerli olmalidir ve saklanir.");

        assertThat(sweeper.pendingCount()).isGreaterThanOrEqualTo(1);
        assertThat(sweeper.sweep()).isGreaterThanOrEqualTo(1);
        assertThat(chunkRepository.existsByDocumentId(documentId)).isTrue();
    }

    @Test
    void aSecondPassDoesNotReIndexWhatIsAlreadyDone() {
        insertDocument("Yuklenici ise baslama tarihinden itibaren on bes gun icinde is programi sunar.");
        sweeper.sweep();
        long afterFirst = chunkRepository.count();

        sweeper.sweep();

        assertThat(chunkRepository.count()).isEqualTo(afterFirst);
    }

    @Test
    void eachPassTakesASmallBiteSoAColdStartDoesNotPinTheCpu() {
        for (int index = 0; index < 5; index++) {
            insertDocument("Sartname maddesi numara " + index
                    + " yuklenici tarafindan eksiksiz uygulanacaktir ve denetlenecektir.");
        }

        // sweep-batch is 2 for this test: the backlog drains over several passes, not all at once.
        assertThat(sweeper.sweep()).isEqualTo(2);
    }

    @Test
    void aDocumentWithNoUsableTextIsNeverPending() {
        long pendingBefore = sweeper.pendingCount();
        insertDocument("   ");

        // An image-only PDF has nothing to embed; it must not sit in the queue forever.
        assertThat(sweeper.pendingCount()).isEqualTo(pendingBefore);
    }

    @Test
    void aFreshlyUploadedFileBecomesSearchableWithoutAnyManualStep() {
        // Uploaded but never text-extracted: the state every customer upload lands in.
        String unique = "sweep-" + System.nanoTime();
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id,
                     original_filename, tender_id, document_type, status, file_path)
                values (?, 'test-hash', 'test', now(), ?, 'yeni.txt', 'TEST-2026-1', 'sartname',
                        'received', ?)
                """, unique, unique, uploadedFile());
        long documentId = jdbcTemplate.queryForObject(
                "select id from documents where message_id = ?", Long.class, unique);

        sweeper.sweep();
        sweeper.sweep();

        assertThat(chunkRepository.existsByDocumentId(documentId)).isTrue();
    }

    @Test
    void anUploadedFileIsVisibleAsAwaitingTextNotAsNothingAtAll() {
        long awaitingBefore = sweeper.awaitingTextCount();
        String unique = "sweep-" + System.nanoTime();
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id,
                     original_filename, tender_id, document_type, status, file_path)
                values (?, 'test-hash', 'test', now(), ?, 'yeni.txt', 'TEST-2026-1', 'sartname',
                        'received', ?)
                """, unique, unique, uploadedFile());

        // Counted as neither indexed nor pending, so without this it reports identically to an
        // empty system — and "nothing was uploaded" is a very different problem from "uploaded but
        // not read yet".
        assertThat(sweeper.awaitingTextCount()).isEqualTo(awaitingBefore + 1);

        sweeper.sweep();

        // Asserted on this row rather than on the global count: the sweep takes a batch, so how far
        // the total drops depends on what else the suite left lying around.
        long documentId = jdbcTemplate.queryForObject(
                "select id from documents where message_id = ?", Long.class, unique);
        assertThat(jdbcTemplate.queryForObject(
                "select extracted_text is not null from documents where id = ?",
                Boolean.class, documentId)).isTrue();
    }

    @Test
    void anAdminCanThrowTheIndexAwayWhenChunkingChanges() {
        long documentId = insertDocument(
                "Idare, hakedis raporunu onayladiktan sonra otuz gun icinde odemeyi gerceklestirir.");
        sweeper.sweep();
        assertThat(chunkRepository.existsByDocumentId(documentId)).isTrue();

        // A plain sweep skips this document from here on — it already has passages for the current
        // model (aSecondPassDoesNotReIndexWhatIsAlreadyDone). Changing how text is split leaves
        // those passages valid-looking and describing the wrong spans, which the model name cannot
        // express, so the rebuild has to be something a human can ask for.
        sweeper.forgetEverything();

        assertThat(chunkRepository.existsByDocumentId(documentId)).isFalse();
        assertThat(sweeper.sweep()).isGreaterThanOrEqualTo(1);
        assertThat(chunkRepository.existsByDocumentId(documentId)).isTrue();
    }

    @Test
    void aDownSidecarWaitsInsteadOfMarkingDocumentsFailed() {
        insertDocument("Teminat mektubu suresi uzatilabilir ve idare tarafindan onaylanir.");
        ((SwitchableEmbeddingModel) embeddingModel).up = false;

        assertThat(sweeper.sweep()).isZero();
        // Still queued, so it gets picked up once the service comes back.
        assertThat(sweeper.pendingCount()).isGreaterThanOrEqualTo(1);
    }

    /**
     * Writes a real file where an upload would put it. Stored paths are only honoured inside the
     * configured data root — a containment check that stops a crafted path from reading anything
     * else on the box — so a temp file elsewhere is correctly refused.
     */
    private String uploadedFile() {
        try {
            java.nio.file.Path root = java.nio.file.Path.of(dataDir).toAbsolutePath().normalize();
            java.nio.file.Files.createDirectories(root);
            java.nio.file.Path path = java.nio.file.Files.createTempFile(root, "docsbot-sweep", ".txt");
            java.nio.file.Files.writeString(path,
                    "Teminat mektubu ihale tarihinden itibaren yuz yirmi takvim gunu gecerli olmalidir.");
            path.toFile().deleteOnExit();
            return path.toString();
        } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private long insertDocument(String extractedText) {
        String unique = "sweep-" + System.nanoTime();
        jdbcTemplate.update("""
                insert into documents
                    (message_id, sender_hash, source, timestamp, media_id,
                     original_filename, tender_id, document_type, status, extracted_text)
                values (?, 'test-hash', 'test', now(), ?, 'sweep.pdf', 'TEST-2026-1', 'sartname', 'received', ?)
                """, unique, unique, extractedText);
        return jdbcTemplate.queryForObject(
                "select id from documents where message_id = ?", Long.class, unique);
    }

    /** Same deterministic stand-in as the pipeline test, with an availability switch. */
    private static final class SwitchableEmbeddingModel implements EmbeddingModel {
        private static final int DIMENSIONS = 64;
        private volatile boolean up = true;

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
            return up;
        }

        @Override
        public List<float[]> embedAll(List<String> passages) {
            return passages.stream().map(SwitchableEmbeddingModel::vectorFor).toList();
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
