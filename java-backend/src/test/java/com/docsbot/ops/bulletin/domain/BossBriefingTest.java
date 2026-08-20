package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The owner's screen. What it must never do is pass off an intention as a signed number: a tender
 * marked won by hand, before the bulletin has published a price, contributes the company's own bid
 * — and the briefing has to say how much of the month's total came from figures like that.
 */
class BossBriefingTest {

    private static final Instant NOW = Instant.parse("2026-08-20T06:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 8, 20);

    private static TenderBid bid(String amount, LocalDate bidAt) {
        return new TenderBid("2026/" + amount, 1L, "Bir iş", "Karayolları", "Konya", "insaat",
                new BigDecimal(amount), "TRY", bidAt, null, "admin", NOW);
    }

    private static TenderResult award(String ikn, String amount) {
        return new TenderResult(ikn, "yapim", LocalDate.of(2026, 8, 18), "Karayolları", "Bir iş",
                "Konya", "Konya", "Açık", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 8, 1),
                new BigDecimal("10000000"), "TRY", new BigDecimal(amount), "TRY", 5, 5,
                "Biz A.Ş.", "Adres", "Konya", false, "gövde", NOW);
    }

    private static BossBriefing briefing(List<BidOutcome> outcomes) {
        return BossBriefing.of(outcomes, TODAY, 0, 0, 0, 0, 0, List.of());
    }

    @Test
    void countsOnlyThisMonthsBidsAgainstThisMonth() {
        BossBriefing briefing = briefing(List.of(
                BidOutcome.of(bid("8000000", LocalDate.of(2026, 8, 3)), List.of()),
                BidOutcome.of(bid("5000000", LocalDate.of(2026, 7, 28)), List.of())));

        assertThat(briefing.periodStart()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(briefing.bidsThisMonth()).isEqualTo(1);
        // July's bid is still awaiting a result — that count is all-time, because money that is not
        // decided does not stop mattering when a month ends.
        assertThat(briefing.awaitingResult()).isEqualTo(2);
        assertThat(briefing.awaitingAmount()).isEqualByComparingTo("13000000");
    }

    @Test
    void aWonTenderIsWorthWhatItWasLetFor() {
        TenderBid ours = bid("8000000", LocalDate.of(2026, 8, 3));
        BossBriefing briefing = briefing(List.of(
                BidOutcome.of(ours, List.of(award(ours.getIkn(), "8000000")))));

        assertThat(briefing.wonThisMonth()).isEqualTo(1);
        assertThat(briefing.wonAmountThisMonth()).isEqualByComparingTo("8000000");
        // Nothing in the total is our own guess.
        assertThat(briefing.wonAmountFromOurOwnFigure()).isZero();
    }

    @Test
    void aWinMarkedByHandSaysHowMuchOfTheTotalIsStillOurOwnFigure() {
        TenderBid ours = bid("6000000", LocalDate.of(2026, 8, 10));
        ours.update(new BigDecimal("6000000"), LocalDate.of(2026, 8, 10), null, "WON", "admin", NOW);

        BossBriefing briefing = briefing(List.of(BidOutcome.of(ours, List.of())));

        // Counted, because the owner knows they won. Flagged, because the bulletin has not yet
        // published a price and a total that quietly mixed the two would be a number nobody could
        // defend in a meeting.
        assertThat(briefing.wonThisMonth()).isEqualTo(1);
        assertThat(briefing.wonAmountThisMonth()).isEqualByComparingTo("6000000");
        assertThat(briefing.wonAmountFromOurOwnFigure()).isEqualTo(1);
    }

    @Test
    void aWinFromLastMonthDoesNotInflateThisMonth() {
        TenderBid ours = bid("9000000", LocalDate.of(2026, 7, 15));
        BossBriefing briefing = briefing(List.of(
                BidOutcome.of(ours, List.of(award(ours.getIkn(), "9000000")))));

        assertThat(briefing.wonThisMonth()).isZero();
        assertThat(briefing.wonAmountThisMonth()).isEqualByComparingTo("0");
    }

    @Test
    void carriesWhatIsWaitingOnTheOwnerRatherThanTheWholeTaskBoard() {
        BossBriefing briefing = BossBriefing.of(List.of(), TODAY, 3, 2, 5, 1, 4, List.of());

        // The owner's question is "what is stopped because of me", and a completion waiting for
        // approval is the only kind of task that answers it.
        assertThat(briefing.pendingApproval()).isEqualTo(3);
        assertThat(briefing.overdueTasks()).isEqualTo(2);
        assertThat(briefing.dueThisWeek()).isEqualTo(5);
        assertThat(briefing.lapsedCredentials()).isEqualTo(1);
        assertThat(briefing.expiringCredentials()).isEqualTo(4);
    }

    @Test
    void anEmptyCompanyGetsZeroesRatherThanAnException() {
        BossBriefing briefing = briefing(List.of());

        assertThat(briefing.bidsThisMonth()).isZero();
        assertThat(briefing.wonAmountThisMonth()).isEqualByComparingTo("0");
        assertThat(briefing.awaitingAmount()).isEqualByComparingTo("0");
        assertThat(briefing.upcoming()).isEmpty();
    }
}
