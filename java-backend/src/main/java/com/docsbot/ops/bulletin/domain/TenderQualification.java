package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What an announcement demands of whoever bids on it, read out of its own printed text.
 *
 * <p>Every criterion here is a ratio against the bid, not a fixed sum: a yapım tender asks for work
 * experience worth at least 50% of the price you offer, a hizmet tender 25%, and turnover the same
 * way. That is what makes the answer computable at all — the company knows what it intends to bid,
 * and the announcement supplies the multiplier.
 *
 * <p>Whether a company's past work counts as "benzer iş" is deliberately not decided here. The
 * definition is carried through as printed and left to the reader: it is a judgement about the
 * substance of two jobs, an idare can and does reject the comparison, and a checklist that guessed
 * would be encouraging somebody to spend a week preparing a bid on our opinion.
 */
public record TenderQualification(
        /** False when the announcement carries no qualification section at all — mal alımı, mostly. */
        boolean present,
        /** "teklif edilen bedelin % 50 oranından az olmamak üzere" — the work-experience multiplier. */
        Integer experienceRatioPercent,
        /** How far back the experience may reach: five years for hizmet, fifteen for yapım. */
        Integer experienceYears,
        /** "Toplam cironun teklif edilen bedelin %25'inden az olmaması". */
        Integer turnoverRatioPercent,
        /** The lower bar for turnover earned in this line of work specifically. */
        Integer sectorTurnoverRatioPercent,
        BigDecimal currentRatioMin,
        BigDecimal equityRatioMin,
        BigDecimal bankDebtRatioMax,
        /**
         * True when the announcement says outright that it sets no financial criteria — which most
         * yapım tenders do. A real answer, and a different one from "we could not read it".
         */
        boolean economicCriteriaWaived,
        /** Section 4.4, as printed. */
        String similarWork,
        boolean bidBondRequired
) {

    private static final Pattern SECTION =
            Pattern.compile("yeterliğe ilişkin bilgi ve belgeler");
    /**
     * "…teklif edilen bedelin % 50 oranından az olmamak üzere…". Matched on text whose line breaks
     * have been squeezed out first: the phrase wraps mid-sentence in the printed bulletin, and
     * requiring a literal space cost the ratio on every announcement in one day's yapım file.
     */
    private static final Pattern EXPERIENCE_RATIO =
            Pattern.compile("bedelin ?% ?(\\d{1,3}) ?oranından az olmamak üzere");
    private static final Pattern EXPERIENCE_YEARS =
            Pattern.compile("Son ((?:on )?(?:bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)) yıl içinde");
    private static final Pattern TURNOVER_RATIO =
            Pattern.compile("Toplam cironun teklif edilen bedelin ?% ?(\\d{1,3})");
    private static final Pattern SECTOR_TURNOVER_RATIO =
            Pattern.compile("cironun ise teklif edilen bedelin ?% ?(\\d{1,3})");
    private static final Pattern CURRENT_RATIO =
            Pattern.compile("Cari oranın[^)]*\\)[^0-9]{0,20}([0-9],[0-9]{1,2})");
    private static final Pattern EQUITY_RATIO =
            Pattern.compile("Öz kaynak oranının[^)]*\\)[^0-9]{0,20}([0-9],[0-9]{1,2})");
    private static final Pattern BANK_DEBT_RATIO =
            Pattern.compile("Kısa vadeli banka borçlarının öz kaynaklara oranının ?([0-9],[0-9]{1,2})");
    private static final Pattern ECONOMIC_WAIVED =
            Pattern.compile("Ekonomik ve mali yeterliğe ilişkin bilgi, belge veya kriter belirtilmemiştir");
    private static final Pattern SIMILAR_WORK =
            Pattern.compile("benzer iş olarak kabul edilecek işler[^:]{0,120}: ?(.{10,400}?)"
                    + "(?: ?4\\.4\\.\\d| ?5-| ?6-|$)");
    private static final Pattern BID_BOND = Pattern.compile("Geçici teminat");

    /** Turkish number words, as far as a bulletin ever counts in them. */
    private static final Map<String, Integer> NUMBER_WORDS = new LinkedHashMap<>();

    static {
        String[] units = {"bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"};
        for (int index = 0; index < units.length; index++) {
            NUMBER_WORDS.put(units[index], index + 1);
            NUMBER_WORDS.put("on " + units[index], 10 + index + 1);
        }
        NUMBER_WORDS.put("on", 10);
    }

    public static TenderQualification parse(String body) {
        if (body == null || body.isBlank()) {
            return absent();
        }
        // One flat line. The bulletin wraps sentences wherever the column ends, and every pattern
        // here spans more words than fit in a column.
        String text = body.replaceAll("\\s+", " ");
        if (!SECTION.matcher(text).find()) {
            return absent();
        }
        String similar = group(SIMILAR_WORK, text);
        return new TenderQualification(
                true,
                intGroup(EXPERIENCE_RATIO, text),
                years(group(EXPERIENCE_YEARS, text)),
                intGroup(TURNOVER_RATIO, text),
                intGroup(SECTOR_TURNOVER_RATIO, text),
                decimal(group(CURRENT_RATIO, text)),
                decimal(group(EQUITY_RATIO, text)),
                decimal(group(BANK_DEBT_RATIO, text)),
                ECONOMIC_WAIVED.matcher(text).find(),
                similar == null ? null : similar.trim(),
                BID_BOND.matcher(text).find());
    }

    private static TenderQualification absent() {
        return new TenderQualification(false, null, null, null, null, null, null, null,
                false, null, false);
    }

    private static String group(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static Integer intGroup(Pattern pattern, String text) {
        String value = group(pattern, text);
        return value == null ? null : Integer.valueOf(value);
    }

    private static Integer years(String words) {
        return words == null ? null : NUMBER_WORDS.get(words.trim());
    }

    /** "0,75" — the bulletin writes its decimals the Turkish way. */
    private static BigDecimal decimal(String value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(value.replace(',', '.'));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
