package com.docsbot.ops.rag;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits a document's extracted text into the passages that get embedded and searched.
 *
 * <p>Chunking is where retrieval quality is won or lost. Two rules drive the shape here:
 *
 * <ul>
 *   <li><b>Break on meaning, not on character count.</b> A passage cut mid-sentence embeds to a
 *       muddle and retrieves badly, so splits are taken at paragraph boundaries first and sentence
 *       boundaries second, falling back to a hard cut only for text that has neither (a table dump,
 *       a wall of OCR).
 *   <li><b>Overlap.</b> An answer that straddles a boundary would otherwise be findable in neither
 *       half. Each passage repeats the tail of the previous one, so a sentence near a seam appears
 *       whole in at least one chunk.
 * </ul>
 *
 * <p>Sizing targets tender documents specifically: a şartname clause is typically a paragraph or
 * two, so ~900 characters holds a whole provision with its conditions instead of stopping halfway
 * through "…şu şartla ki".
 */
public final class TextChunker {

    private static final int DEFAULT_MAX_CHARS = 900;
    private static final int DEFAULT_OVERLAP_CHARS = 150;
    /** Below this a passage carries no retrievable meaning — a stray heading, a page number. */
    private static final int MIN_CHUNK_CHARS = 40;

    private final int maxChars;
    private final int overlapChars;

    public TextChunker() {
        this(DEFAULT_MAX_CHARS, DEFAULT_OVERLAP_CHARS);
    }

    public TextChunker(int maxChars, int overlapChars) {
        if (maxChars <= 0) {
            throw new IllegalArgumentException("maxChars must be positive");
        }
        if (overlapChars < 0 || overlapChars >= maxChars) {
            throw new IllegalArgumentException("overlapChars must be within [0, maxChars)");
        }
        this.maxChars = maxChars;
        this.overlapChars = overlapChars;
    }

    public List<String> chunk(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String block : meaningfulBlocks(text)) {
            if (block.length() > maxChars) {
                // A single block too long to hold: flush what we have, then split the block itself.
                flush(chunks, current);
                splitOversized(block).forEach(part -> addChunk(chunks, part));
                continue;
            }
            if (current.length() + block.length() + 1 > maxChars) {
                flush(chunks, current);
                carryOverlap(chunks, current);
            }
            if (!current.isEmpty()) {
                current.append('\n');
            }
            current.append(block);
        }
        flush(chunks, current);
        return List.copyOf(chunks);
    }

    /** Paragraphs, with runs of blank lines and stray whitespace collapsed away. */
    private static List<String> meaningfulBlocks(String text) {
        List<String> blocks = new ArrayList<>();
        for (String paragraph : text.split("\\r?\\n\\s*\\r?\\n")) {
            String normalized = paragraph.replaceAll("[ \\t]+", " ").strip();
            if (!normalized.isEmpty()) {
                blocks.add(normalized);
            }
        }
        return blocks;
    }

    /**
     * Splits a paragraph that exceeds the budget. Sentence ends are tried first; a block with no
     * sentence structure at all (a table, an OCR run-on) is cut hard rather than dropped, because
     * unsearchable text is worse than awkwardly-cut text.
     */
    private List<String> splitOversized(String block) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String sentence : block.split("(?<=[.!?:;])\\s+")) {
            if (sentence.length() > maxChars) {
                if (!current.isEmpty()) {
                    parts.add(current.toString().strip());
                    current.setLength(0);
                }
                for (int start = 0; start < sentence.length(); start += maxChars) {
                    parts.add(sentence.substring(start, Math.min(sentence.length(), start + maxChars)).strip());
                }
                continue;
            }
            if (current.length() + sentence.length() + 1 > maxChars) {
                parts.add(current.toString().strip());
                current.setLength(0);
            }
            if (!current.isEmpty()) {
                current.append(' ');
            }
            current.append(sentence);
        }
        if (!current.isEmpty()) {
            parts.add(current.toString().strip());
        }
        return parts;
    }

    /** Seeds the next chunk with the tail of the one just emitted, so seams stay searchable. */
    private void carryOverlap(List<String> chunks, StringBuilder current) {
        current.setLength(0);
        if (overlapChars == 0 || chunks.isEmpty()) {
            return;
        }
        String previous = chunks.get(chunks.size() - 1);
        if (previous.length() <= overlapChars) {
            current.append(previous);
            return;
        }
        String tail = previous.substring(previous.length() - overlapChars);
        // Start the overlap at a word boundary; half a word helps nobody.
        int space = tail.indexOf(' ');
        current.append(space >= 0 ? tail.substring(space + 1) : tail);
    }

    private void flush(List<String> chunks, StringBuilder current) {
        if (current.isEmpty()) {
            return;
        }
        addChunk(chunks, current.toString());
        current.setLength(0);
    }

    private static void addChunk(List<String> chunks, String candidate) {
        String trimmed = candidate.strip();
        if (trimmed.length() >= MIN_CHUNK_CHARS) {
            chunks.add(trimmed);
        }
    }
}
