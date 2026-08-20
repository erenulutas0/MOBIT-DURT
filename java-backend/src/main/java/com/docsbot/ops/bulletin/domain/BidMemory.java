package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the company's own bidding history has to say about how it bids.
 *
 * <p>This is the part a competitor cannot build. They can all tell you what a tender went for; only
 * the software the company bids through knows what it offered, and the two together answer the
 * question nobody can answer today: <em>we keep losing — by how much, to whom, and where?</em>
 *
 * <p>Every figure carries the count it was drawn from, and nothing is summarised below
 * {@link #MINIMUM_SAMPLE}. A company that lost twice has an anecdote, not a pattern, and dressing
 * one up as the other would be the same failure as inventing a discount for a lot award.
 */
public record BidMemory(
        int totalBids,
        int won,
        int lost,
        int pending,
        int unclear,
        /** Null below {@link #MINIMUM_SAMPLE} losses — see the class note. */
        BigDecimal medianGapPercent,
        BigDecimal smallestGapPercent,
        List<RivalCount> rivals,
        List<AuthorityRecord> authorities
) {

    /** Below three, there is no "genelde". */
    public static final int MINIMUM_SAMPLE = 3;

    /**
     * A firm that has taken work this company bid for.
     *
     * @param medianGapPercent how far over them this company usually came, when there are enough
     *                         losses to say
     */
    public record RivalCount(String rival, int beatUs, BigDecimal medianGapPercent) {
    }

    /** How this company fares with one buyer. */
    public record AuthorityRecord(String authority, int bids, int won, BigDecimal medianGapPercent) {
    }

    public static BidMemory of(List<BidOutcome> outcomes) {
        int won = count(outcomes, BidOutcome.Status.WON);
        int lost = count(outcomes, BidOutcome.Status.LOST);
        List<BigDecimal> gaps = outcomes.stream()
                .map(BidOutcome::gapPercent)
                .filter(java.util.Objects::nonNull)
                .filter(gap -> gap.signum() > 0)
                .sorted()
                .toList();
        return new BidMemory(
                outcomes.size(),
                won,
                lost,
                count(outcomes, BidOutcome.Status.PENDING),
                count(outcomes, BidOutcome.Status.UNCLEAR),
                gaps.size() >= MINIMUM_SAMPLE ? median(gaps) : null,
                gaps.isEmpty() ? null : gaps.get(0),
                rivals(outcomes),
                authorities(outcomes));
    }

    private static int count(List<BidOutcome> outcomes, BidOutcome.Status status) {
        return (int) outcomes.stream().filter(outcome -> outcome.status() == status).count();
    }

    /**
     * The firms that keep taking the work, most first.
     *
     * <p>The line worth reading on this screen: "this firm has beaten you five times, usually by
     * about three percent". A company that learns that has learned something no bulletin told it.
     */
    private static List<RivalCount> rivals(List<BidOutcome> outcomes) {
        Map<String, List<BigDecimal>> byRival = new LinkedHashMap<>();
        for (BidOutcome outcome : outcomes) {
            if (outcome.status() != BidOutcome.Status.LOST || outcome.winner() == null
                    || outcome.winner().isBlank()) {
                continue;
            }
            byRival.computeIfAbsent(outcome.winner().trim(), key -> new ArrayList<>())
                    .add(outcome.gapPercent());
        }
        List<RivalCount> rivals = new ArrayList<>();
        for (Map.Entry<String, List<BigDecimal>> entry : byRival.entrySet()) {
            List<BigDecimal> gaps = entry.getValue().stream()
                    .filter(java.util.Objects::nonNull).sorted().toList();
            rivals.add(new RivalCount(entry.getKey(), entry.getValue().size(),
                    gaps.size() >= MINIMUM_SAMPLE ? median(gaps) : null));
        }
        rivals.sort(Comparator.comparingInt(RivalCount::beatUs).reversed()
                .thenComparing(RivalCount::rival));
        return rivals.stream().limit(10).toList();
    }

    private static List<AuthorityRecord> authorities(List<BidOutcome> outcomes) {
        Map<String, List<BidOutcome>> byAuthority = new LinkedHashMap<>();
        for (BidOutcome outcome : outcomes) {
            String authority = outcome.bid().getAuthority();
            if (authority != null && !authority.isBlank()) {
                byAuthority.computeIfAbsent(authority.trim(), key -> new ArrayList<>()).add(outcome);
            }
        }
        List<AuthorityRecord> records = new ArrayList<>();
        for (Map.Entry<String, List<BidOutcome>> entry : byAuthority.entrySet()) {
            List<BigDecimal> gaps = entry.getValue().stream()
                    .map(BidOutcome::gapPercent)
                    .filter(java.util.Objects::nonNull)
                    .filter(gap -> gap.signum() > 0)
                    .sorted()
                    .toList();
            records.add(new AuthorityRecord(entry.getKey(), entry.getValue().size(),
                    count(entry.getValue(), BidOutcome.Status.WON),
                    gaps.size() >= MINIMUM_SAMPLE ? median(gaps) : null));
        }
        records.sort(Comparator.comparingInt(AuthorityRecord::bids).reversed()
                .thenComparing(AuthorityRecord::authority));
        return records.stream().limit(10).toList();
    }

    private static BigDecimal median(List<BigDecimal> sorted) {
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 1) {
            return sorted.get(middle);
        }
        return sorted.get(middle - 1).add(sorted.get(middle))
                .divide(BigDecimal.valueOf(2), 1, RoundingMode.HALF_UP);
    }
}
