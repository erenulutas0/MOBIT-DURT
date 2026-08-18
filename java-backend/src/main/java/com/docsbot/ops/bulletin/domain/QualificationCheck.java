package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * The announcement's demands set beside what the company can prove, for one intended bid.
 *
 * <p>It does not decide whether to bid. It puts two numbers next to each other and says which side
 * is larger, which is the arithmetic somebody currently does on paper the night before the deadline
 * and occasionally gets wrong by an order of magnitude.
 *
 * <p>Three outcomes and not two. "You do not qualify" and "we do not know what your turnover is"
 * are opposite messages, and collapsing the second into the first would send a company away from a
 * tender it could have won. Anything the company has not entered comes back {@link Status#UNKNOWN}
 * with the missing field named.
 */
public record QualificationCheck(
        /** Whether the announcement carries a qualification section at all. */
        boolean qualificationPublished,
        BigDecimal bidAmount,
        List<Item> items
) {

    public enum Status {
        /** The company clears the bar. */
        MET,
        /** The company is short, by a stated amount. */
        SHORT,
        /** The tender asks for nothing on this axis. */
        NOT_REQUIRED,
        /** The company has not recorded the figure — never to be read as failure. */
        UNKNOWN,
        /** Stated for the reader to judge, because we cannot. */
        INFORMATION,
    }

    /**
     * One line of the checklist.
     *
     * @param required what the tender asks for, when it is a number
     * @param available what the company has, when it has recorded one
     * @param note the part a number cannot carry
     */
    public record Item(
            String key,
            String label,
            Status status,
            BigDecimal required,
            BigDecimal available,
            String note
    ) {
    }

    /**
     * @param qualification what the announcement demands
     * @param company what the company can prove, or null when nothing has been entered
     * @param bid the amount the company intends to offer — every bar in the announcement is a ratio
     *            of it, so without one there is nothing to compare against
     * @param tenderDate when the tender is held, for judging whether the experience certificate is
     *                   still inside its window
     * @param lapsedCredentials how many of the company's own papers have already expired
     * @param expiringCredentials how many expire within the warning window
     */
    public static QualificationCheck of(TenderQualification qualification,
                                        CompanyQualification company,
                                        BigDecimal bid,
                                        LocalDate tenderDate,
                                        int lapsedCredentials,
                                        int expiringCredentials) {
        List<Item> items = new ArrayList<>();
        items.add(experience(qualification, company, bid, tenderDate));
        items.add(turnover(qualification, company, bid));
        items.add(sectorTurnover(qualification, company, bid));
        items.addAll(balanceSheet(qualification, company));
        items.add(credentials(lapsedCredentials, expiringCredentials));
        if (qualification.similarWork() != null) {
            items.add(new Item("similar_work", "Benzer iş tanımı", Status.INFORMATION, null, null,
                    qualification.similarWork()));
        }
        if (qualification.bidBondRequired() && bid != null) {
            // Not a pass or a fail: the bidder chooses the amount, the law only sets a floor.
            items.add(new Item("bid_bond", "Geçici teminat (asgari %3)", Status.INFORMATION,
                    percentOf(bid, 3), null, "Teklif bedelinin en az %3'ü kadar teminat sunulur."));
        }
        return new QualificationCheck(qualification.present(), bid, List.copyOf(items));
    }

    private static Item experience(TenderQualification tender, CompanyQualification company,
                                   BigDecimal bid, LocalDate tenderDate) {
        String label = "İş deneyimi";
        if (tender.experienceRatioPercent() == null) {
            return new Item("experience", label, Status.NOT_REQUIRED, null, null,
                    tender.present() ? "Bu ihalede iş deneyimi belgesi istenmiyor." : null);
        }
        BigDecimal required = bid == null ? null : percentOf(bid, tender.experienceRatioPercent());
        BigDecimal have = company == null ? null : company.getExperienceAmount();
        if (bid == null) {
            return new Item("experience", label, Status.UNKNOWN, null, have,
                    "Teklif tutarını girin: şart, teklifin %" + tender.experienceRatioPercent()
                            + "'i kadar iş deneyimi.");
        }
        if (have == null) {
            return new Item("experience", label, Status.UNKNOWN, required, null,
                    "İş deneyim belgenizin tutarı kayıtlı değil.");
        }
        // A certificate older than the tender's window is not evidence, however large it is.
        String note = null;
        Status status = have.compareTo(required) >= 0 ? Status.MET : Status.SHORT;
        if (tender.experienceYears() != null && company.getExperienceDate() != null
                && tenderDate != null
                && company.getExperienceDate().isBefore(tenderDate.minusYears(tender.experienceYears()))) {
            status = Status.SHORT;
            note = "Belge " + tender.experienceYears() + " yıllık süreyi aşmış ("
                    + company.getExperienceDate() + ").";
        }
        return new Item("experience", label, status, required, have, note);
    }

    private static Item turnover(TenderQualification tender, CompanyQualification company, BigDecimal bid) {
        return ratioItem("turnover", "Toplam ciro", tender, tender.turnoverRatioPercent(), bid,
                company == null ? null : company.bestTurnover(),
                "Son yıl cironuz kayıtlı değil.");
    }

    private static Item sectorTurnover(TenderQualification tender, CompanyQualification company,
                                       BigDecimal bid) {
        return ratioItem("sector_turnover", "İş koluna ait ciro", tender,
                tender.sectorTurnoverRatioPercent(), bid,
                company == null ? null : company.getSectorTurnover(),
                "İş kolunuza ait ciro kayıtlı değil.");
    }

    private static Item ratioItem(String key, String label, TenderQualification tender,
                                  Integer ratio, BigDecimal bid, BigDecimal have, String missing) {
        if (ratio == null) {
            return new Item(key, label, Status.NOT_REQUIRED, null, null,
                    tender.economicCriteriaWaived()
                            ? "Bu ihalede ekonomik ve mali yeterlik kriteri belirtilmemiş."
                            : null);
        }
        BigDecimal required = bid == null ? null : percentOf(bid, ratio);
        if (bid == null || have == null) {
            return new Item(key, label, Status.UNKNOWN, required, have,
                    bid == null ? "Teklif tutarını girin." : missing);
        }
        return new Item(key, label, have.compareTo(required) >= 0 ? Status.MET : Status.SHORT,
                required, have, null);
    }

    private static List<Item> balanceSheet(TenderQualification tender, CompanyQualification company) {
        List<Item> items = new ArrayList<>();
        items.add(ratio("current_ratio", "Cari oran", tender.currentRatioMin(),
                company == null ? null : company.getCurrentRatio(), true));
        items.add(ratio("equity_ratio", "Öz kaynak oranı", tender.equityRatioMin(),
                company == null ? null : company.getEquityRatio(), true));
        items.add(ratio("bank_debt_ratio", "Kısa vadeli banka borcu / öz kaynak",
                tender.bankDebtRatioMax(),
                company == null ? null : company.getBankDebtRatio(), false));
        return items;
    }

    /** @param atLeast true when the company's figure must reach the bar, false when it must stay under */
    private static Item ratio(String key, String label, BigDecimal bar, BigDecimal have, boolean atLeast) {
        if (bar == null) {
            return new Item(key, label, Status.NOT_REQUIRED, null, null, null);
        }
        if (have == null) {
            return new Item(key, label, Status.UNKNOWN, bar, null, "Bilanço oranınız kayıtlı değil.");
        }
        boolean met = atLeast ? have.compareTo(bar) >= 0 : have.compareTo(bar) < 0;
        return new Item(key, label, met ? Status.MET : Status.SHORT, bar, have, null);
    }

    private static Item credentials(int lapsed, int expiring) {
        if (lapsed > 0) {
            return new Item("credentials", "Şirket belgeleri", Status.SHORT, null, null,
                    lapsed + " belgenizin süresi dolmuş. Süresi geçmiş belgeyle teklif verilemez.");
        }
        if (expiring > 0) {
            return new Item("credentials", "Şirket belgeleri", Status.INFORMATION, null, null,
                    expiring + " belgenizin süresi yaklaşıyor; ihale tarihinde geçerli olmalı.");
        }
        return new Item("credentials", "Şirket belgeleri", Status.MET, null, null, null);
    }

    private static BigDecimal percentOf(BigDecimal amount, int percent) {
        return amount.multiply(BigDecimal.valueOf(percent))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }
}
