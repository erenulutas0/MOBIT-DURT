package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One firm's record in the public results: what it takes, from whom, and at what discount.
 *
 * <p>The mirror of {@link AuthorityProfile}. That one answers "what does this buyer usually pay";
 * this one answers "who am I bidding against, and how do they price". A company that knows a rival
 * habitually goes eleven percent under is deciding with information; one that does not is guessing
 * against somebody who has done this two hundred times.
 *
 * <p>{@link #beatUs()} is the line that could not exist without the company's own bid memory: the
 * public record says who won, and only our own figures say who won <em>against us</em>.
 */
public record RivalProfile(
        String winner,
        int contracts,
        /** Sum of every contract we hold for this firm. */
        BigDecimal totalAmount,
        String currency,
        int distinctAuthorities,
        /** Null below {@link #MINIMUM_SAMPLE} usable contracts — see {@link AuthorityProfile}. */
        BigDecimal medianDiscount,
        /** How many of this company's own bids this firm has taken, when that is known. */
        int beatUs,
        List<Count> authorities,
        List<Count> provinces,
        List<Contract> recent
) {

    /** Below three, there is no "genelde" — the same bar every summary in this codebase uses. */
    public static final int MINIMUM_SAMPLE = 3;

    public record Count(String name, int contracts) {
    }

    /**
     * One awarded contract, trimmed to what a list row shows.
     *
     * <p>The id is nullable because an entity that has not been persisted has none; a primitive
     * here would make the record assume a database round-trip it has no business assuming.
     */
    public record Contract(
            Long id,
            String ikn,
            String title,
            String authority,
            String province,
            BigDecimal amount,
            java.time.LocalDate contractDate,
            BigDecimal discountPercent
    ) {
    }

    /** How many contracts to carry back; a firm with a hundred and fifty is a list, not a profile. */
    private static final int RECENT_LIMIT = 15;

    public static RivalProfile of(String winner, List<TenderResult> contracts, int beatUs) {
        BigDecimal total = BigDecimal.ZERO;
        Map<String, Integer> byAuthority = new LinkedHashMap<>();
        Map<String, Integer> byProvince = new LinkedHashMap<>();
        List<BigDecimal> discounts = new ArrayList<>();
        String currency = null;

        for (TenderResult contract : contracts) {
            if (contract.getContractAmount() != null) {
                total = total.add(contract.getContractAmount());
                if (currency == null) {
                    currency = contract.getContractCurrency();
                }
            }
            if (contract.getAuthority() != null && !contract.getAuthority().isBlank()) {
                byAuthority.merge(contract.getAuthority().trim(), 1, Integer::sum);
            }
            if (contract.getProvince() != null && !contract.getProvince().isBlank()) {
                byProvince.merge(contract.getProvince().trim(), 1, Integer::sum);
            }
            BigDecimal discount = contract.discountPercent();
            if (discount != null) {
                discounts.add(discount);
            }
        }
        discounts.sort(Comparator.naturalOrder());

        return new RivalProfile(
                winner,
                contracts.size(),
                total,
                currency == null ? "TRY" : currency,
                byAuthority.size(),
                discounts.size() >= MINIMUM_SAMPLE ? median(discounts) : null,
                beatUs,
                top(byAuthority),
                top(byProvince),
                contracts.stream().limit(RECENT_LIMIT).map(RivalProfile::contract).toList());
    }

    private static Contract contract(TenderResult result) {
        return new Contract(result.getId(), result.getIkn(), result.getTitle(),
                result.getAuthority(), result.getProvince(), result.getContractAmount(),
                result.getContractDate(), result.discountPercent());
    }

    private static List<Count> top(Map<String, Integer> counts) {
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .limit(5)
                .map(entry -> new Count(entry.getKey(), entry.getValue()))
                .toList();
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
