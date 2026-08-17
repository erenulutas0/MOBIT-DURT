package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What one idare's past awards say about how it buys.
 *
 * <p>The question a company has before pricing a bid is not "what did this tender go for" but
 * "what does this buyer usually pay". An idare that habitually lets work at 6% under its estimate
 * and one that lets it at 30% are two different bids, and nothing in the announcement distinguishes
 * them.
 *
 * <p>The median rather than the mean, because one lot award that slipped past the checks would drag
 * a mean anywhere and barely move a median. And {@link #sampleSize()} is published beside the
 * figure rather than behind it: a "typical discount" drawn from two contracts is an anecdote, and
 * the reader is the one who has to decide whether to lean on it.
 */
public record AuthorityProfile(
        String authority,
        /** Every award we hold for this idare, lot awards included. */
        int totalAwards,
        /** How many of those the discount could honestly be computed from. */
        int sampleSize,
        /** Null below {@link #MINIMUM_SAMPLE} — see {@link #medianDiscount()}. */
        BigDecimal medianDiscount,
        BigDecimal lowestDiscount,
        BigDecimal highestDiscount,
        /** Average number of bidders, over the awards that reported one. */
        BigDecimal averageBidders,
        /** The firms that took the most work here, most first. */
        List<WinnerCount> topWinners
) {

    /**
     * Below three awards there is no "usually".
     *
     * <p>Two contracts 20 points apart have a median, and printing it as this buyer's habit would
     * be a number invented out of a coin flip. The awards themselves are still listed — the reader
     * can look at two results and draw their own conclusion, which is the honest version of what a
     * summary would have claimed for them.
     */
    public static final int MINIMUM_SAMPLE = 3;

    /** How many contracts one firm has taken from this idare. */
    public record WinnerCount(String winner, int awards) {
    }

    public static AuthorityProfile of(String authority, List<TenderResult> awards) {
        List<BigDecimal> discounts = awards.stream()
                .map(TenderResult::discountPercent)
                .filter(java.util.Objects::nonNull)
                .sorted()
                .toList();
        List<Integer> bidders = awards.stream()
                .map(TenderResult::getBidCount)
                .filter(java.util.Objects::nonNull)
                .toList();
        return new AuthorityProfile(
                authority,
                awards.size(),
                discounts.size(),
                discounts.size() >= MINIMUM_SAMPLE ? median(discounts) : null,
                discounts.isEmpty() ? null : discounts.get(0),
                discounts.isEmpty() ? null : discounts.get(discounts.size() - 1),
                average(bidders),
                topWinners(awards));
    }

    private static BigDecimal median(List<BigDecimal> sorted) {
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 1) {
            return sorted.get(middle);
        }
        return sorted.get(middle - 1)
                .add(sorted.get(middle))
                .divide(BigDecimal.valueOf(2), 1, java.math.RoundingMode.HALF_UP);
    }

    private static BigDecimal average(List<Integer> values) {
        if (values.isEmpty()) {
            return null;
        }
        long total = values.stream().mapToLong(Integer::longValue).sum();
        return BigDecimal.valueOf(total)
                .divide(BigDecimal.valueOf(values.size()), 1, java.math.RoundingMode.HALF_UP);
    }

    /**
     * The firms that keep winning here.
     *
     * <p>Counted by contract rather than by value: a company reading this wants to know who it will
     * be bidding against, and a firm that took eight small lots is as much a regular as one that
     * took a single large job.
     */
    private static List<WinnerCount> topWinners(List<TenderResult> awards) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (TenderResult award : awards) {
            String winner = award.getWinner();
            if (winner != null && !winner.isBlank()) {
                counts.merge(winner.trim(), 1, Integer::sum);
            }
        }
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .limit(5)
                .map(entry -> new WinnerCount(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparingInt(WinnerCount::awards).reversed())
                .toList();
    }
}
