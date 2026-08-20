package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The mirror of the idare profile: who a company is bidding against, and how that firm prices.
 *
 * <p>Same restraint as everywhere else — no "usually" below three usable contracts, and a lot award
 * never contributes a discount it does not have.
 */
class RivalProfileTest {

    private static final Instant NOW = Instant.parse("2026-08-21T06:00:00Z");

    private static TenderResult contract(String estimate, String amount, String authority,
                                         String province, boolean lots) {
        return new TenderResult("2026/" + amount, "yapim", LocalDate.of(2026, 8, 21), authority,
                "Bir iş", province, province, "Açık", LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 8, 1), new BigDecimal(estimate), "TRY", new BigDecimal(amount),
                "TRY", 5, 5, "Rakip A.Ş.", "Adres", province, lots, "gövde", NOW);
    }

    @Test
    void addsUpWhatTheFirmHasTakenAndFromWhom() {
        RivalProfile profile = RivalProfile.of("Rakip A.Ş.", List.of(
                contract("10000000", "9000000", "Karayolları", "Konya", false),
                contract("5000000", "4500000", "Karayolları", "Konya", false),
                contract("2000000", "1800000", "DSİ", "Ankara", false)), 0);

        assertThat(profile.contracts()).isEqualTo(3);
        assertThat(profile.totalAmount()).isEqualByComparingTo("15300000");
        assertThat(profile.distinctAuthorities()).isEqualTo(2);
        // Who they win from, most first — the buyer a company will keep meeting them at.
        assertThat(profile.authorities().get(0).name()).isEqualTo("Karayolları");
        assertThat(profile.authorities().get(0).contracts()).isEqualTo(2);
        assertThat(profile.provinces().get(0).name()).isEqualTo("Konya");
    }

    @Test
    void readsTheFirmsPricingHabitOnlyWhenThereIsOne() {
        RivalProfile enough = RivalProfile.of("Rakip A.Ş.", List.of(
                contract("100", "95", "Karayolları", "Konya", false),
                contract("100", "90", "Karayolları", "Konya", false),
                contract("100", "80", "DSİ", "Ankara", false)), 0);
        assertThat(enough.medianDiscount()).isEqualByComparingTo("10.0");

        // Two contracts are an anecdote; calling their middle a habit is a coin flip in a suit.
        RivalProfile thin = RivalProfile.of("Rakip A.Ş.", List.of(
                contract("100", "95", "Karayolları", "Konya", false),
                contract("100", "80", "DSİ", "Ankara", false)), 0);
        assertThat(thin.medianDiscount()).isNull();
        assertThat(thin.contracts()).isEqualTo(2);
    }

    @Test
    void aLotAwardContributesNoDiscountItDoesNotHave() {
        RivalProfile profile = RivalProfile.of("Rakip A.Ş.", List.of(
                contract("100", "95", "Karayolları", "Konya", false),
                contract("100", "90", "Karayolları", "Konya", false),
                contract("100", "85", "DSİ", "Ankara", false),
                // The estimate covers the whole tender and the amount covers one lot.
                contract("1619588", "25130", "DSİ", "Ankara", true)), 0);

        assertThat(profile.contracts()).isEqualTo(4);
        // Present in the count, absent from the habit — a 98% figure would drag any middle to
        // nonsense and it was never a discount to begin with.
        assertThat(profile.medianDiscount()).isEqualByComparingTo("10.0");
    }

    @Test
    void carriesTheOneLineThePublicRecordCannotProduce() {
        RivalProfile profile = RivalProfile.of("Rakip A.Ş.", List.of(
                contract("100", "95", "Karayolları", "Konya", false)), 4);

        // The bulletin says who won. Only our own bid memory says who won against us — and that is
        // the line no competing service can put on a screen.
        assertThat(profile.beatUs()).isEqualTo(4);
    }

    @Test
    void aFirmWithNothingRecordedIsEmptyRatherThanAnException() {
        RivalProfile profile = RivalProfile.of("Hiç İş Almamış Ltd.", List.of(), 0);

        assertThat(profile.contracts()).isZero();
        assertThat(profile.totalAmount()).isEqualByComparingTo("0");
        assertThat(profile.medianDiscount()).isNull();
        assertThat(profile.recent()).isEmpty();
    }
}
