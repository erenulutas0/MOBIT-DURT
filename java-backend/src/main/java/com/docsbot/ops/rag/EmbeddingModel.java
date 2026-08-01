package com.docsbot.ops.rag;

import java.util.List;

/**
 * Turns text into the vector its meaning maps to. Deliberately the only thing the rest of the RAG
 * pipeline knows about embedding, so where the numbers come from stays an implementation detail:
 * today a self-hosted multilingual model on the same box as Piper (no API key, no per-document
 * cost), later a hosted one, without a line changing in chunking, storage or search.
 *
 * <p>Two vectors are only comparable when they came from the same model, so every implementation
 * names itself and that name is stored next to each vector.
 */
public interface EmbeddingModel {

    /** Stable identifier stored with each vector; changing it invalidates the existing index. */
    String name();

    int dimensions();

    /** True when the model is reachable; a down sidecar must degrade, not throw on every request. */
    boolean available();

    /**
     * Embeds passages for storage. Batched because the per-call overhead dominates for short texts,
     * and indexing a document means hundreds of them.
     */
    List<float[]> embedAll(List<String> passages);

    /**
     * Embeds a user's question. Separate from {@link #embedAll} because instruction-tuned embedding
     * models (the e5 family among them) expect queries and passages to be prefixed differently, and
     * getting that wrong quietly halves retrieval quality.
     */
    float[] embedQuery(String query);
}
