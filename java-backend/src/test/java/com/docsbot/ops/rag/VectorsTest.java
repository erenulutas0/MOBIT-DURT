package com.docsbot.ops.rag;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VectorsTest {

    @Test
    void packingSurvivesTheRoundTripThroughStorage() {
        float[] original = {0.5f, -0.25f, 1.0f, 0f, 3.14159f};

        assertThat(Vectors.unpack(Vectors.pack(original))).isEqualTo(original);
    }

    @Test
    void identicalMeaningScoresHighest() {
        float[] vector = {0.2f, 0.8f, -0.5f};

        assertThat(Vectors.cosineSimilarity(vector, vector)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void oppositeDirectionScoresLowest() {
        assertThat(Vectors.cosineSimilarity(new float[]{1, 0}, new float[]{-1, 0}))
                .isCloseTo(-1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void magnitudeDoesNotAffectSimilarity() {
        // Only direction carries meaning, so a longer vector pointing the same way ranks the same.
        assertThat(Vectors.cosineSimilarity(new float[]{1, 2, 3}, new float[]{10, 20, 30}))
                .isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void anEmptyPassageScoresZeroRatherThanPoisoningTheRankingWithNaN() {
        assertThat(Vectors.cosineSimilarity(new float[]{0, 0, 0}, new float[]{1, 2, 3})).isZero();
    }

    @Test
    void vectorsFromDifferentModelsAreRejectedRatherThanSilentlyCompared() {
        assertThatThrownBy(() -> Vectors.cosineSimilarity(new float[]{1, 2}, new float[]{1, 2, 3}))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not comparable");
    }
}
