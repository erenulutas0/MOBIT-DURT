package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.bulletin.domain.TenderResult.DiscountStatus;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "What does this buyer usually pay" is the question a company has before pricing a bid, and the
 * ways to answer it dishonestly are the interesting ones: a median drawn from two contracts, or one
 * drawn from lot awards that were never whole tenders to begin with.
 */
class AuthorityProfileTest {

    private static final Instant NOW = Instant.parse("2026-08-18T06:00:00Z");

    private static TenderResult award(String estimate, String amount, String winner, Integer bidders) {
        return award(estimate, amount, winner, bidders, false);
    }

    private static TenderResult award(String estimate, String amount, String winner, Integer bidders,
                                      boolean lots) {
        return new TenderResult(
                "2026/1", "yapim", LocalDate.of(2026, 8, 18), "TCDD", "Bir iş",
                "İzmir", "Aliağa", "Açık", LocalDate.of(2026, 6, 30), LocalDate.of(2026, 8, 7),
                new BigDecimal(estimate), "TRY", new BigDecimal(amount), "TRY",
                bidders, bidders, winner, "Adres", "İzmir", lots, "gövde", NOW);
    }

    @Test
    void aMedianDrawnFromTwoContractsIsNotPublished() {
        AuthorityProfile profile = AuthorityProfile.of("TCDD", List.of(
                award("100", "80", "A Ltd.", 4),
                award("100", "60", "B Ltd.", 6)));

        // Two contracts twenty points apart have a median, and printing it as this buyer's habit
        // would be a number invented out of a coin flip.
        assertThat(profile.medianDiscount()).isNull();
        assertThat(profile.sampleSize()).isEqualTo(2);
        // The spread is still shown: the reader can look at both and decide for themselves.
        assertThat(profile.lowestDiscount()).isEqualByComparingTo("20.0");
        assertThat(profile.highestDiscount()).isEqualByComparingTo("40.0");
    }

    @Test
    void threeContractsAreEnoughToSayUsually() {
        AuthorityProfile profile = AuthorityProfile.of("TCDD", List.of(
                award("100", "90", "A Ltd.", 3),
                award("100", "80", "B Ltd.", 5),
                award("100", "50", "C Ltd.", 7)));

        assertThat(profile.medianDiscount()).isEqualByComparingTo("20.0");
        assertThat(profile.averageBidders()).isEqualByComparingTo("5.0");
    }

    @Test
    void lotAwardsAreCountedButNeverAveraged() {
        AuthorityProfile profile = AuthorityProfile.of("TCDD", List.of(
                award("100", "90", "A Ltd.", 3),
                award("100", "80", "B Ltd.", 3),
                award("100", "70", "C Ltd.", 3),
                // One lot of a divided tender: the estimate covers the whole thing.
                award("1619588", "25130", "D Ltd.", 5, true)));

        // Present in the count, absent from the statistic — the award happened, but its ratio
        // describes two different scopes and would drag the middle to nonsense.
        assertThat(profile.totalAwards()).isEqualTo(4);
        assertThat(profile.sampleSize()).isEqualTo(3);
        assertThat(profile.medianDiscount()).isEqualByComparingTo("20.0");
    }

    @Test
    void anUnflaggedLotAwardIsKeptOutByItsOwnImplausibility() {
        // "58 Kalem Muhtelif Motor Malzemeleri": a 78-million estimate against a 450-lira contract,
        // with nothing in the bulletin admitting the tender was divided. A bid at a tenth of the
        // estimate would already face aşırı düşük teklif sorgulaması; this is three orders past it.
        TenderResult undetected = award("78095746.08", "450.00", "E Ltd.", 9);

        assertThat(undetected.discountStatus()).isEqualTo(DiscountStatus.SUSPECTED_LOT_AWARD);
        assertThat(undetected.discountPercent()).isNull();
    }

    @Test
    void arealSixtyPercentDiscountSurvivesTheSameCheck() {
        // The line sits in the empty band between two populations, not in the tail of one: of 1,346
        // awards believed whole, the 98th percentile was 69.5% and exactly one landed between 75
        // and 90. A check that cost genuine discounts would be worse than the leak it plugs.
        assertThat(award("100", "40", "F Ltd.", 5).discountPercent()).isEqualByComparingTo("60.0");
        assertThat(award("100", "25", "G Ltd.", 5).discountPercent()).isEqualByComparingTo("75.0");
        assertThat(award("100", "11", "H Ltd.", 5).discountPercent()).isEqualByComparingTo("89.0");
    }

    @Test
    void namesTheFirmsThatKeepWinningHere() {
        AuthorityProfile profile = AuthorityProfile.of("TCDD", List.of(
                award("100", "90", "Sık Kazanan A.Ş.", 3),
                award("100", "80", "Sık Kazanan A.Ş.", 3),
                award("100", "70", "Bir Kez Ltd.", 3)));

        // Who a company will be bidding against is as much a part of "how this buyer buys" as the
        // price is.
        assertThat(profile.topWinners()).hasSize(2);
        assertThat(profile.topWinners().get(0).winner()).isEqualTo("Sık Kazanan A.Ş.");
        assertThat(profile.topWinners().get(0).awards()).isEqualTo(2);
    }

    @Test
    void anIdareWithNothingUsableSaysSoRatherThanShowingZero() {
        AuthorityProfile profile = AuthorityProfile.of("TCDD", List.of(
                award("1619588", "25130", "A Ltd.", null, true)));

        // Zero percent means "let at the estimate", which is a real and different outcome.
        assertThat(profile.medianDiscount()).isNull();
        assertThat(profile.lowestDiscount()).isNull();
        assertThat(profile.averageBidders()).isNull();
        assertThat(profile.totalAwards()).isEqualTo(1);
    }
}
