package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The screen a company's owner opens, as opposed to the one whoever prepares the files opens.
 *
 * <p>The home screen already answers "what do I have to deal with today", and it is shaped for the
 * person doing the work: late tasks, papers about to lapse, tenders that suit us. An owner asks two
 * different questions — <em>what is waiting on me</em>, and <em>where is the money</em> — and gets
 * neither from a task list.
 *
 * <p>Nothing here is estimated. A won tender contributes the price it was actually let for when the
 * result bulletin has said so, and the company's own bid when it has not; the two are counted
 * separately so the figure never quietly mixes a fact with an intention.
 */
public record BossBriefing(
        /** First day of the month these figures cover. */
        LocalDate periodStart,
        @SuppressWarnings("unused") int bidsThisMonth,
        int wonThisMonth,
        /** Sum of what the won work is worth, and how much of that is still our own figure. */
        BigDecimal wonAmountThisMonth,
        int wonAmountFromOurOwnFigure,
        /** Bids with no published result yet, all time — the money that is not decided. */
        int awaitingResult,
        BigDecimal awaitingAmount,
        /** Tasks stopped, waiting for the owner to approve a completion. */
        int pendingApproval,
        int overdueTasks,
        int dueThisWeek,
        int lapsedCredentials,
        int expiringCredentials,
        /** Tenders the company is preparing for, soonest first. */
        List<Upcoming> upcoming
) {

    /** A tender with a preparation task, and the hour it closes. */
    public record Upcoming(
            long noticeId,
            String ikn,
            String title,
            String authority,
            String tenderAtText,
            java.time.Instant tenderAt,
            Long taskId
    ) {
    }

    /**
     * @param outcomes every bid this company has made, with what became of it
     * @param today the business day this briefing is for
     */
    public static BossBriefing of(List<BidOutcome> outcomes, LocalDate today,
                                  int pendingApproval, int overdueTasks, int dueThisWeek,
                                  int lapsedCredentials, int expiringCredentials,
                                  List<Upcoming> upcoming) {
        LocalDate periodStart = today.withDayOfMonth(1);

        int bidsThisMonth = 0;
        int wonThisMonth = 0;
        BigDecimal wonAmount = BigDecimal.ZERO;
        int wonFromOwnFigure = 0;
        int awaiting = 0;
        BigDecimal awaitingAmount = BigDecimal.ZERO;

        for (BidOutcome outcome : outcomes) {
            LocalDate bidAt = outcome.bid().getBidAt();
            boolean thisMonth = bidAt != null && !bidAt.isBefore(periodStart);
            if (thisMonth) {
                bidsThisMonth++;
            }
            if (outcome.status() == BidOutcome.Status.WON && thisMonth) {
                wonThisMonth++;
                // The contract's own figure when the bulletin has published one; our bid otherwise.
                // Counted apart so the total never passes off an intention as a signed number.
                if (outcome.winningAmount() != null) {
                    wonAmount = wonAmount.add(outcome.winningAmount());
                } else {
                    wonAmount = wonAmount.add(outcome.bid().getAmount());
                    wonFromOwnFigure++;
                }
            }
            if (outcome.status() == BidOutcome.Status.PENDING) {
                awaiting++;
                awaitingAmount = awaitingAmount.add(outcome.bid().getAmount());
            }
        }

        return new BossBriefing(periodStart, bidsThisMonth, wonThisMonth, wonAmount,
                wonFromOwnFigure, awaiting, awaitingAmount, pendingApproval, overdueTasks,
                dueThisWeek, lapsedCredentials, expiringCredentials, upcoming);
    }
}
