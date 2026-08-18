package com.docsbot.ops.bulletin.domain;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.bulletin.domain.QualificationCheck.Item;
import com.docsbot.ops.bulletin.domain.QualificationCheck.Status;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The arithmetic somebody currently does on paper the night before a deadline. What matters is less
 * the sums than the refusals: it must not turn "we have not been told" into "you do not qualify",
 * and it must not decide the one question — whether past work counts as similar — that belongs to
 * the idare.
 */
class QualificationCheckTest {

    private static final LocalDate TENDER_DAY = LocalDate.of(2026, 9, 1);

    private static String fixture(String name) throws IOException {
        try (InputStream stream = QualificationCheckTest.class
                .getResourceAsStream("/bulletin/" + name)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Map<String, Item> check(String fixture, CompanyQualification company,
                                           String bid) throws IOException {
        return QualificationCheck.of(
                        TenderQualification.parse(fixture(fixture)), company,
                        bid == null ? null : new BigDecimal(bid), TENDER_DAY, 0, 0)
                .items().stream()
                .collect(Collectors.toMap(Item::key, Function.identity(), (a, b) -> a));
    }

    /** Reflection rather than a constructor: the entity is filled by JPA in production. */
    private static CompanyQualification company(String experience, LocalDate experienceDate,
                                                String turnover) {
        try {
            CompanyQualification company = CompanyQualification.class
                    .getDeclaredConstructor().newInstance();
            company.update(experience == null ? null : new BigDecimal(experience), experienceDate,
                    "Altyapı işleri", turnover == null ? null : new BigDecimal(turnover), null,
                    null, null, null, null, null, "test", java.time.Instant.now());
            return company;
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    void turnsTheAnnouncementsRatioIntoTheSumThisBidActuallyNeeds() throws IOException {
        // Yapım: work experience worth at least 50% of the offer. Bid 8 million, need 4.
        Map<String, Item> items = check("yeterlik-yapim.txt",
                company("6200000", LocalDate.of(2024, 5, 1), null), "8000000");

        Item experience = items.get("experience");
        assertThat(experience.required()).isEqualByComparingTo("4000000.00");
        assertThat(experience.available()).isEqualByComparingTo("6200000");
        assertThat(experience.status()).isEqualTo(Status.MET);
    }

    @Test
    void saysHowShortTheCompanyIsRatherThanJustRefusing() throws IOException {
        Map<String, Item> items = check("yeterlik-yapim.txt",
                company("1500000", LocalDate.of(2024, 5, 1), null), "8000000");

        Item experience = items.get("experience");
        assertThat(experience.status()).isEqualTo(Status.SHORT);
        // Both numbers travel, so the reader can see that a smaller bid would clear the bar —
        // which is a decision they may well take, and one a bare "yetersiz" would hide.
        assertThat(experience.required()).isEqualByComparingTo("4000000.00");
        assertThat(experience.available()).isEqualByComparingTo("1500000");
    }

    @Test
    void anExperienceCertificatePastItsWindowIsNotEvidenceHoweverLarge() throws IOException {
        // Yapım counts fifteen years back; this certificate is from 2005.
        Map<String, Item> items = check("yeterlik-yapim.txt",
                company("90000000", LocalDate.of(2005, 3, 1), null), "8000000");

        Item experience = items.get("experience");
        assertThat(experience.status()).isEqualTo(Status.SHORT);
        assertThat(experience.note()).contains("15 yıllık süreyi aşmış");
    }

    @Test
    void anUnenteredFigureIsUnknownAndNeverAFailure() throws IOException {
        Map<String, Item> items = check("yeterlik-hizmet.txt", company(null, null, null), "1000000");

        // The difference this test defends: a company that has not typed its turnover in yet must
        // not be told it cannot bid. That is a claim, and a wrong one costs a tender.
        assertThat(items.get("turnover").status()).isEqualTo(Status.UNKNOWN);
        assertThat(items.get("turnover").note()).contains("kayıtlı değil");
        assertThat(items.get("experience").status()).isEqualTo(Status.UNKNOWN);
    }

    @Test
    void aTenderThatAsksForNoFinancialCriteriaSaysSo() throws IOException {
        Map<String, Item> items = check("yeterlik-yapim.txt", company("6200000", null, "500000"),
                "8000000");

        // Most yapım tenders set none. "Not required" and "you are short" are opposite readings of
        // the same blank, and only one of them sends somebody looking for a bar to clear.
        assertThat(items.get("turnover").status()).isEqualTo(Status.NOT_REQUIRED);
        assertThat(items.get("turnover").note()).contains("kriteri belirtilmemiş");
    }

    @Test
    void readsTheHizmetTurnoverBarAndTheBalanceSheetBars() throws IOException {
        Map<String, Item> items = check("yeterlik-hizmet.txt",
                company("400000", LocalDate.of(2025, 1, 1), "300000"), "1000000");

        // Toplam ciro: %25 of a million.
        assertThat(items.get("turnover").required()).isEqualByComparingTo("250000.00");
        assertThat(items.get("turnover").status()).isEqualTo(Status.MET);
        assertThat(items.get("current_ratio").required()).isEqualByComparingTo("0.75");
        assertThat(items.get("current_ratio").status()).isEqualTo(Status.UNKNOWN);
    }

    @Test
    void neverDecidesWhetherPastWorkCountsAsSimilar() throws IOException {
        Map<String, Item> items = check("yeterlik-hizmet.txt",
                company("400000", LocalDate.of(2025, 1, 1), "300000"), "1000000");

        // The definition is carried through for the reader. Whether their job matches it is a
        // judgement about the substance of two contracts that an idare can and does reject.
        Item similar = items.get("similar_work");
        assertThat(similar.status()).isEqualTo(Status.INFORMATION);
        assertThat(similar.note()).isNotBlank();
    }

    @Test
    void aLapsedCompanyPaperIsTheCheapestDisqualificationThereIs() throws IOException {
        QualificationCheck result = QualificationCheck.of(
                TenderQualification.parse(fixture("yeterlik-yapim.txt")),
                company("6200000", LocalDate.of(2024, 5, 1), null),
                new BigDecimal("8000000"), TENDER_DAY, 2, 0);

        Item credentials = result.items().stream()
                .filter(item -> item.key().equals("credentials")).findFirst().orElseThrow();
        assertThat(credentials.status()).isEqualTo(Status.SHORT);
        assertThat(credentials.note()).contains("2 belgenizin süresi dolmuş");
    }

    @Test
    void withoutABidItReportsTheRatiosInsteadOfAVerdict() throws IOException {
        Map<String, Item> items = check("yeterlik-yapim.txt", company("6200000", null, null), null);

        // Every bar is a ratio of the offer, so there is nothing to compare against yet — but what
        // the tender asks for is still worth reading before deciding on a price.
        assertThat(items.get("experience").status()).isEqualTo(Status.UNKNOWN);
        assertThat(items.get("experience").note()).contains("%50");
    }
}
