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

    @Test
    void noPassageExceedsTheBudget() {
        String paragraph = "Idare, sozlesmenin uygulanmasi sirasinda ortaya cikabilecek "
                + "her turlu anlasmazligi oncelikle sulh yoluyla cozmeye calisir. ";
        List<String> chunks = chunker.chunk(paragraph.repeat(8));

        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk.length()).isLessThanOrEqualTo(200));
    }
}
