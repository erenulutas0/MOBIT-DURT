package com.docsbot.ops.rag;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Vector packing and similarity.
 *
 * <p>Vectors are stored as big-endian packed float32 in a BYTEA rather than a pgvector column,
 * because production runs postgres:17-alpine and swapping a live database's image is not a casual
 * change. The format is deliberately the same one pgvector uses on the wire, so the eventual
 * migration is a column type change and a backfill, not a re-embed.
 */
public final class Vectors {

    private Vectors() {
    }

    public static byte[] pack(float[] vector) {
        ByteBuffer buffer = ByteBuffer.allocate(vector.length * Float.BYTES).order(ByteOrder.BIG_ENDIAN);
        for (float value : vector) {
            buffer.putFloat(value);
        }
        return buffer.array();
    }

    public static float[] unpack(byte[] packed) {
        ByteBuffer buffer = ByteBuffer.wrap(packed).order(ByteOrder.BIG_ENDIAN);
        float[] vector = new float[packed.length / Float.BYTES];
        for (int index = 0; index < vector.length; index++) {
            vector[index] = buffer.getFloat();
        }
        return vector;
    }

    /**
     * Cosine similarity in [-1, 1]; higher is closer in meaning. Computed without normalising in
     * place so callers can keep raw model output, and guarded against a zero vector (an empty or
     * all-stopword passage) which would otherwise divide by zero and poison the ranking with NaN.
     */
    public static double cosineSimilarity(float[] left, float[] right) {
        if (left.length != right.length) {
            throw new IllegalArgumentException(
                    "Vectors from different models are not comparable: " + left.length + " vs " + right.length);
        }
        double dot = 0;
        double leftNorm = 0;
        double rightNorm = 0;
        for (int index = 0; index < left.length; index++) {
            dot += (double) left[index] * right[index];
            leftNorm += (double) left[index] * left[index];
            rightNorm += (double) right[index] * right[index];
        }
        if (leftNorm == 0 || rightNorm == 0) {
            return 0;
        }
        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }
}
