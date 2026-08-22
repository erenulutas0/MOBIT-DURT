package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The company's own bidding history — the one thing a competing service cannot hold, because the
 * number never leaves the company.
 *
 * <p>What these tests defend is the restraint. Telling somebody they won a tender they lost would
 * poison every other figure on the screen, and a "usually" drawn from two losses is an anecdote
 * wearing a statistic's clothes.
 */
class BidMemoryTest {

    private static final Instant NOW = Instant.parse("2026-08-18T06:00:00Z");

    private static TenderBid bid(String ikn, String amount, String authority) {
        return new TenderBid(ikn, 1L, "Bir iş", authority, "Konya", "insaat",
                new BigDecimal(amount), "TRY", LocalDate.of(2026, 7, 1), null, "admin", NOW);
    }

    private static TenderResult award(String ikn, String amount, String winner, boolean lots) {
        return new TenderResult(ikn, "yapim", LocalDate.of(2026, 8, 18), "Karayolları", "Bir iş",
                "Konya", "Konya", "Açık", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 8, 1),
                new BigDecimal("10000000"), "TRY", new BigDecimal(amount), "TRY", 5, 5,
                winner, "Adres", "Konya", lots, "gövde", NOW);
    }

    private static TenderBid corrected(String ikn, String override) {
        TenderBid bid = bid(ikn, "8250000", "Karayolları");
        bid.update(bid.getAmount(), bid.getBidAt(), null, override, "admin", NOW);
        return bid;
    }

    @Test
    void aCorrectionNobodyCanReadIsIgnoredRatherThanThrown() {
        // The column carries no CHECK and nothing validated the write, so a single stored "won"
        // instead of "WON" used to reach Status.valueOf and throw — turning /bids, /briefing and
        // /rivals into a permanent 500 for the whole company until somebody edited the database.
        BidOutcome outcome = BidOutcome.of(corrected("2026/9", "kazandik"),
                List.of(award("2026/9", "8000000", "Rakip A.Ş.", false)));

        // Falls back to what the published result says, as if nobody had corrected anything.
        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.LOST);
        assertThat(outcome.winner()).isEqualTo("Rakip A.Ş.");
    }

    @Test
    void aCorrectionInTheWrongCaseIsStillHonoured() {
        BidOutcome outcome = BidOutcome.of(corrected("2026/10", "won"),
                List.of(award("2026/10", "8000000", "Rakip A.Ş.", false)));

        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.WON);
        assertThat(outcome.note()).contains("elle işaretlendi");
    }

    @Test
    void tellsYouHowFarOverTheWinnerYouCame() {
        BidOutcome outcome = BidOutcome.of(bid("2026/1", "8250000", "Karayolları"),
                List.of(award("2026/1", "8000000", "Rakip A.Ş.", false)));

        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.LOST);
        // The only feedback a bidder ever gets, and today they get it by doing the subtraction in
        // their head off EKAP, if at all.
        assertThat(outcome.gapPercent()).isEqualByComparingTo("3.1");
        assertThat(outcome.winner()).isEqualTo("Rakip A.Ş.");
    }

    @Test
    void aBidWithNoResultYetIsPendingRatherThanLost() {
        BidOutcome outcome = BidOutcome.of(bid("2026/2", "5000000", "Karayolları"), List.of());

        // Weeks pass between a bid and its result. Reading that silence as a loss would make the
        // whole memory wrong for most of its life.
        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.PENDING);
        assertThat(outcome.gapPercent()).isNull();
    }

    @Test
    void onlyAnExactMatchIsCalledAWin() {
        BidOutcome exact = BidOutcome.of(bid("2026/3", "8000000", "Karayolları"),
                List.of(award("2026/3", "8000000", "Biz A.Ş.", false)));
        assertThat(exact.status()).isEqualTo(BidOutcome.Status.WON);

        // A hair over is a loss until somebody who was in the room says otherwise. Announcing a win
        // that did not happen would discredit every other number beside it.
        BidOutcome nearly = BidOutcome.of(bid("2026/4", "8000001", "Karayolları"),
                List.of(award("2026/4", "8000000", "Rakip A.Ş.", false)));
        assertThat(nearly.status()).isEqualTo(BidOutcome.Status.LOST);
    }

    @Test
    void beingCheaperAndStillLosingIsFlaggedAsSomethingElseEntirely() {
        BidOutcome outcome = BidOutcome.of(bid("2026/5", "7000000", "Karayolları"),
                List.of(award("2026/5", "8000000", "Rakip A.Ş.", false)));

        // Not a pricing lesson: it means yeterlik or aşırı düşük teklif, and filing it as a loss by
        // price would teach the company to raise a bid that was never the problem.
        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.UNCLEAR);
        assertThat(outcome.note()).contains("aşırı düşük");
        assertThat(outcome.gapPercent()).isNull();
    }

    @Test
    void aLotAwardIsNotComparedAgainstAWholeBid() {
        BidOutcome outcome = BidOutcome.of(bid("2026/6", "8000000", "Karayolları"),
                List.of(award("2026/6", "25130", "Rakip A.Ş.", true)));

        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.UNCLEAR);
        assertThat(outcome.note()).contains("kısımlara bölünmüş");
    }

    @Test
    void somebodyWhoWasInTheRoomOverridesTheArithmetic() {
        TenderBid corrected = bid("2026/7", "8000001", "Karayolları");
        corrected.update(new BigDecimal("8000001"), LocalDate.of(2026, 7, 1), null, "WON",
                "admin", NOW);

        BidOutcome outcome = BidOutcome.of(corrected,
                List.of(award("2026/7", "8000000", "Biz A.Ş.", false)));

        assertThat(outcome.status()).isEqualTo(BidOutcome.Status.WON);
    }

    @Test
    void namesTheFirmThatKeepsBeatingYouAndByHowMuch() {
        BidMemory memory = BidMemory.of(List.of(
                BidOutcome.of(bid("2026/8", "8300000", "Karayolları"),
                        List.of(award("2026/8", "8000000", "Sürekli Rakip A.Ş.", false))),
                BidOutcome.of(bid("2026/9", "10400000", "Karayolları"),
                        List.of(award("2026/9", "10000000", "Sürekli Rakip A.Ş.", false))),
                BidOutcome.of(bid("2026/10", "5150000", "DSİ"),
                        List.of(award("2026/10", "5000000", "Sürekli Rakip A.Ş.", false)))));

        // The sentence this whole feature exists to produce.
        BidMemory.RivalCount rival = memory.rivals().get(0);
        assertThat(rival.rival()).isEqualTo("Sürekli Rakip A.Ş.");
        assertThat(rival.beatUs()).isEqualTo(3);
        assertThat(rival.medianGapPercent()).isEqualByComparingTo("3.8");
    }

    @Test
    void twoLossesAreAnAnecdoteAndGetNoMedian() {
        BidMemory memory = BidMemory.of(List.of(
                BidOutcome.of(bid("2026/11", "8300000", "Karayolları"),
                        List.of(award("2026/11", "8000000", "Rakip A.Ş.", false))),
                BidOutcome.of(bid("2026/12", "12000000", "Karayolları"),
                        List.of(award("2026/12", "10000000", "Rakip A.Ş.", false)))));

        assertThat(memory.lost()).isEqualTo(2);
        assertThat(memory.medianGapPercent()).isNull();
        // The closest miss is still worth showing: it is a fact, not an average.
        assertThat(memory.smallestGapPercent()).isEqualByComparingTo("3.8");
        assertThat(memory.rivals().get(0).medianGapPercent()).isNull();
    }

    @Test
    void countsEveryStateSoTheScreenNeverImpliesMoreThanItKnows() {
        BidMemory memory = BidMemory.of(List.of(
                BidOutcome.of(bid("2026/13", "8000000", "Karayolları"),
                        List.of(award("2026/13", "8000000", "Biz A.Ş.", false))),
                BidOutcome.of(bid("2026/14", "9000000", "Karayolları"),
                        List.of(award("2026/14", "8000000", "Rakip A.Ş.", false))),
                BidOutcome.of(bid("2026/15", "7000000", "DSİ"), List.of()),
                BidOutcome.of(bid("2026/16", "6000000", "DSİ"),
                        List.of(award("2026/16", "25130", "Rakip A.Ş.", true)))));

        assertThat(memory.totalBids()).isEqualTo(4);
        assertThat(memory.won()).isEqualTo(1);
        assertThat(memory.lost()).isEqualTo(1);
        assertThat(memory.pending()).isEqualTo(1);
        assertThat(memory.unclear()).isEqualTo(1);
    }
}
