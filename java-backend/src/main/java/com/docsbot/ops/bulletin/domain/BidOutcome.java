package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * What became of one bid, worked out from the published result.
 *
 * <p>Read rather than stored: a bid recorded today has no answer for weeks, and the answer arrives
 * on its own when the result bulletin catches up. Nothing has to be revisited by hand.
 *
 * <p>The interesting outcome is not the win. It is the near miss with a number on it — "you were
 * 3.1% over the firm that took it" — because that is the only feedback a bidder ever gets, and
 * today they get it by reading EKAP and doing the subtraction in their head, if at all.
 */
public record BidOutcome(
        TenderBid bid,
        Status status,
        /** What the work was let for, once a result exists. */
        BigDecimal winningAmount,
        String winner,
        /**
         * How far over the winner this bid was, as a percentage of the winning price. Null unless
         * the bid lost to a comparable figure.
         */
        BigDecimal gapPercent,
        String note
) {

    public enum Status {
        /** No result published yet — the usual state for weeks after a bid. */
        PENDING,
        WON,
        LOST,
        /**
         * A result exists but the two figures cannot be compared honestly: a lot award, or a bid
         * that was lower than the winning price and still did not take the work.
         */
        UNCLEAR,
    }

    /**
     * @param results every contract recorded under this bid's İKN, in any order
     */
    public static BidOutcome of(TenderBid bid, List<TenderResult> results) {
        Status stated = statedOutcome(bid.getOutcomeOverride());
        if (stated != null) {
            // Somebody who was in the room corrected us. That beats any inference.
            TenderResult single = results.size() == 1 ? results.get(0) : null;
            return new BidOutcome(bid, stated,
                    single == null ? null : single.getContractAmount(),
                    single == null ? null : single.getWinner(),
                    null, "Sonuç elle işaretlendi.");
        }
        if (results.isEmpty()) {
            return new BidOutcome(bid, Status.PENDING, null, null, null,
                    "Sonuç ilanı henüz yayımlanmadı.");
        }
        if (results.size() > 1 || results.get(0).isPartialAward()) {
            // The tender was let in lots. Our single figure was for something else, or for one of
            // several, and any comparison would be inventing a rival that does not exist.
            return new BidOutcome(bid, Status.UNCLEAR, null, null, null,
                    "İhale kısımlara bölünmüş; teklifinizle karşılaştırılamıyor.");
        }
        TenderResult result = results.get(0);
        BigDecimal winning = result.getContractAmount();
        if (winning == null || winning.signum() <= 0) {
            return new BidOutcome(bid, Status.UNCLEAR, null, result.getWinner(), null,
                    "Sonuç ilanında sözleşme bedeli okunamadı.");
        }
        int comparison = bid.getAmount().compareTo(winning);
        if (comparison == 0) {
            // Exact, and only exact. Telling a company it won a tender it lost would poison every
            // other number on the screen, and the company itself always knows the truth — so a
            // near-match is left as a loss for them to correct rather than guessed into a win.
            return new BidOutcome(bid, Status.WON, winning, result.getWinner(), BigDecimal.ZERO,
                    "Sözleşme bedeli teklifinizle aynı.");
        }
        if (comparison < 0) {
            // Lower and still not chosen. Usually a yeterlik rejection or an aşırı düşük teklif
            // inquiry — worth surfacing precisely because it is not a pricing lesson.
            return new BidOutcome(bid, Status.UNCLEAR, winning, result.getWinner(), null,
                    "Teklifiniz kazanandan düşüktü ama iş başkasına verilmiş — "
                            + "yeterlik veya aşırı düşük sorgulaması olabilir.");
        }
        BigDecimal gap = bid.getAmount().subtract(winning)
                .divide(winning, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP);
        return new BidOutcome(bid, Status.LOST, winning, result.getWinner(), gap, null);
    }
    /**
     * The manual correction, if it is one this code understands.
     *
     * <p>Status.valueOf on the raw column was the whole of the reading, and it throws on anything
     * it does not recognise — so a single stored "won" instead of "WON" turned /bids, /briefing and
     * /rivals into a permanent 500 for the entire company, on every request, until somebody edited
     * the database. The column carries no CHECK and nothing validated the write. A value that
     * cannot be read is ignored here and the outcome is inferred from the published result as if
     * nobody had corrected anything: worse than the correction, far better than three dead screens.
     */
    private static Status statedOutcome(String override) {
        if (override == null || override.isBlank()) {
            return null;
        }
        try {
            return Status.valueOf(override.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException unreadable) {
            return null;
        }
    }

}
