package com.docsbot.ops.rag;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Chunking is where retrieval quality is won or lost: a passage cut mid-sentence embeds to a muddle
 * and retrieves badly, and an answer straddling a boundary is findable in neither half.
 */
class TextChunkerTest {

    private final TextChunker chunker = new TextChunker(200, 40);

    @Test
    void shortTextStaysOnePassage() {
        List<String> chunks = chunker.chunk(
                "Teklif geçerlilik süresi ihale tarihinden itibaren 90 takvim günüdür.");

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0)).contains("90 takvim günü");
    }

    @Test
    void emptyOrBlankTextProducesNothingToSearch() {
        assertThat(chunker.chunk(null)).isEmpty();
        assertThat(chunker.chunk("   \n\n  ")).isEmpty();
    }

    @Test
    void paragraphsAreKeptWholeRatherThanCutAtACharacterCount() {
        String first = "Teminat mektubu, ihale tarihinden itibaren en az 120 gun gecerli olmalidir.";
        String second = "Yuklenici, ise baslama tarihinden itibaren 15 gun icinde is programi sunar.";

        List<String> chunks = chunker.chunk(first + "\n\n" + second);

        // Both fit in one passage together; neither is split apart mid-thought.
        assertThat(chunks).allSatisfy(chunk ->
                assertThat(chunk).doesNotEndWith("gecerli").doesNotEndWith("is"));
        assertThat(String.join(" ", chunks)).contains("120 gun").contains("15 gun");
    }

    @Test
    void aPassageTooLongToHoldIsSplitAtSentenceEnds() {
        String sentence = "Bu madde ihale sartnamesinin ayrilmaz bir parcasidir. ";
        List<String> chunks = chunker.chunk(sentence.repeat(12));

        assertThat(chunks.size()).isGreaterThan(1);
        // Every passage ends on a sentence boundary rather than mid-word.
        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk).endsWith("."));
    }

    @Test
    void consecutivePassagesOverlapSoASeamStaysSearchable() {
        String sentence = "Yuklenici tarafindan sunulacak belgeler eksiksiz olmalidir. ";
        List<String> chunks = chunker.chunk(sentence.repeat(10));

        assertThat(chunks.size()).isGreaterThan(1);
        String firstTail = chunks.get(0).substring(Math.max(0, chunks.get(0).length() - 40));
        // Some words from the end of one passage reappear at the start of the next.
        assertThat(chunks.get(1)).containsAnyOf(firstTail.split(" "));
    }

    @Test
    void textWithNoSentenceStructureIsStillIndexedRatherThanDropped() {
        // A table dump or an OCR run-on: unsearchable text is worse than awkwardly-cut text.
        List<String> chunks = chunker.chunk("A".repeat(700));

        assertThat(chunks).isNotEmpty();
        assertThat(String.join("", chunks)).contains("A".repeat(200));
    }

    @Test
    void noiseTooSmallToCarryMeaningIsSkipped() {
        // A stray page number or heading fragment is not a retrievable passage.
        assertThat(chunker.chunk("12")).isEmpty();
    }

    /**
     * A şartname announces its own structure, and a madde is the unit somebody quotes back as the
     * answer. Packing to a character budget instead put payment terms, invoicing paperwork and
     * advance rules in one passage, and its embedding pointed at none of them.
     */
    private final TextChunker realistic = new TextChunker();

    private static final String SARTNAME = """
            ÖRNEK ÖDEME VE HAKEDİŞ ESASLARI
            Bu belge örnek metindir.

            MADDE 1 - HAKEDİŞ DÜZENLENMESİ
            Hakedişler aylık dönemler halinde düzenlenir.

            MADDE 2 - ÖDEME SÜRESİ
            İdare, hakediş raporunu onayladıktan sonra 30 gün içinde ödemeyi gerçekleştirir.

            MADDE 3 - AVANS
            Sözleşme bedelinin %10'una kadar avans verilebilir.
            """;

    @Test
    void aNumberedSartnameGivesOnePassagePerClause() {
        List<String> chunks = realistic.chunk(SARTNAME);

        // Title block plus three maddeler, not one 500-character blend of all four.
        assertThat(chunks).hasSize(4);
        assertThat(chunks.get(1)).startsWith("MADDE 1");
        assertThat(chunks.get(2)).startsWith("MADDE 2");
        assertThat(chunks.get(3)).startsWith("MADDE 3");
    }

    @Test
    void theClauseHeadingStaysWithItsBody() {
        List<String> chunks = realistic.chunk(SARTNAME);

        // "MADDE 2 - ÖDEME SÜRESİ" is most of what makes this passage findable from a question
        // about when money arrives; separated from its body it would retrieve nothing.
        assertThat(chunks).anySatisfy(chunk ->
                assertThat(chunk).contains("ÖDEME SÜRESİ").contains("30 gün"));
    }

    @Test
    void eachClauseIsAboutOneThingOnly() {
        List<String> chunks = realistic.chunk(SARTNAME);

        // The payment clause must not carry the advance rules along with it: a passage covering
        // both embeds to the midpoint between them and answers neither question well.
        assertThat(chunks).filteredOn(chunk -> chunk.contains("30 gün"))
                .allSatisfy(chunk -> assertThat(chunk).doesNotContain("avans"));
    }

    @Test
    void theTitleBlockAheadOfTheFirstClauseIsKept() {
        List<String> chunks = realistic.chunk(SARTNAME);

        // It is what identifies the document — "which şartname is this" is a real question.
        assertThat(chunks.get(0)).contains("ÖDEME VE HAKEDİŞ ESASLARI");
    }

    @Test
    void proseThatMerelyMentionsAClauseIsNotSplitOnIt() {
        // One reference to a madde inside a sentence is prose, not a numbered şartname; splitting
        // there would cut a paragraph mid-thought.
        String prose = "Sözleşmenin feshi halinde madde 12 hükümleri uygulanır ve "
                + "yüklenici hakkında yasaklama işlemi başlatılır.";

        assertThat(realistic.chunk(prose)).hasSize(1);
    }

    @Test
    void aClauseTooLongToHoldIsStillSplit() {
        String filler = "Yüklenici bu yükümlülüğü eksiksiz yerine getirir. ".repeat(30);
        String document = "MADDE 1 - KAPSAM\nBu şartname işin tamamını kapsar ve ekleriyle bir bütündür."
                + "\n\nMADDE 2 - AYRINTILAR\n" + filler;

        List<String> chunks = realistic.chunk(document);

        assertThat(chunks.size()).isGreaterThan(2);
        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk.length()).isLessThanOrEqualTo(900));
    }

    @Test
    void noPassageExceedsTheBudget() {
        String paragraph = "Idare, sozlesmenin uygulanmasi sirasinda ortaya cikabilecek "
                + "her turlu anlasmazligi oncelikle sulh yoluyla cozmeye calisir. ";
        List<String> chunks = chunker.chunk(paragraph.repeat(8));

        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk.length()).isLessThanOrEqualTo(200));
    }
}
