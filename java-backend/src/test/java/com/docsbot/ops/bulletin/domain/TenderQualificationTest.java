package com.docsbot.ops.bulletin.domain;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Read against two announcements taken verbatim out of the production bulletin, because the shapes
 * that matter here are the ones the Kamu İhale Kurumu's own typesetter produces: sentences that
 * wrap mid-phrase, ratios written "% 50" with a space, decimals with a comma, and a yapım tender
 * that declares no financial criteria at all.
 */
class TenderQualificationTest {

    private static String fixture(String name) throws IOException {
        try (InputStream stream = TenderQualificationTest.class
                .getResourceAsStream("/bulletin/" + name)) {
            assertThat(stream).as("fixture %s", name).isNotNull();
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void readsAYapimTendersWorkExperienceBar() throws IOException {
        TenderQualification qualification = TenderQualification.parse(fixture("yeterlik-yapim.txt"));

        assertThat(qualification.present()).isTrue();
        // "teklif edilen bedelin % 50 oranından az olmamak üzere" — and the phrase wraps across a
        // line break in the printed bulletin, which is why the text is flattened before matching.
        assertThat(qualification.experienceRatioPercent()).isEqualTo(50);
        // "Son on beş yıl içinde": construction work counts for fifteen years, services for five.
        assertThat(qualification.experienceYears()).isEqualTo(15);
        assertThat(qualification.bidBondRequired()).isTrue();
    }

    @Test
    void aYapimTenderWithNoFinancialCriteriaSaysSoRatherThanComingBackEmpty() throws IOException {
        TenderQualification qualification = TenderQualification.parse(fixture("yeterlik-yapim.txt"));

        // "Ekonomik ve mali yeterliğe ilişkin bilgi, belge veya kriter belirtilmemiştir." is an
        // answer, and a different one from "we could not read it" — most yapım tenders say it, and
        // a company reading "—" would go looking for a bar that does not exist.
        assertThat(qualification.economicCriteriaWaived()).isTrue();
        assertThat(qualification.turnoverRatioPercent()).isNull();
        assertThat(qualification.currentRatioMin()).isNull();
    }

    @Test
    void readsAHizmetTendersTurnoverAndBalanceSheetBars() throws IOException {
        TenderQualification qualification = TenderQualification.parse(fixture("yeterlik-hizmet.txt"));

        assertThat(qualification.experienceRatioPercent()).isEqualTo(25);
        assertThat(qualification.experienceYears()).isEqualTo(5);
        // "Toplam cironun … %25'inden, hizmet işleri ile ilgili cironun ise … %15'inden az olmaması"
        assertThat(qualification.turnoverRatioPercent()).isEqualTo(25);
        assertThat(qualification.sectorTurnoverRatioPercent()).isEqualTo(15);
        assertThat(qualification.economicCriteriaWaived()).isFalse();
    }

    @Test
    void readsTheBalanceSheetRatiosWithTheirTurkishDecimalComma() throws IOException {
        TenderQualification qualification = TenderQualification.parse(fixture("yeterlik-hizmet.txt"));

        assertThat(qualification.currentRatioMin()).isEqualByComparingTo("0.75");
        assertThat(qualification.equityRatioMin()).isEqualByComparingTo("0.15");
        // Printed as "0,50’den küçük" with a typographic apostrophe hard against the number.
        assertThat(qualification.bankDebtRatioMax()).isEqualByComparingTo("0.50");
    }

    @Test
    void carriesTheSimilarWorkDefinitionThroughWithoutJudgingIt() throws IOException {
        TenderQualification qualification = TenderQualification.parse(fixture("yeterlik-hizmet.txt"));

        // Whether a company's past job counts as similar work is a judgement about the substance of
        // two contracts that an idare can and does reject. Guessing it would send somebody off to
        // spend a week preparing a bid on our opinion.
        assertThat(qualification.similarWork()).isNotBlank();
    }

    @Test
    void anAnnouncementWithNoQualificationSectionIsAbsentRatherThanEmpty() {
        TenderQualification qualification = TenderQualification.parse(
                "1- İdarenin adı: Bir Belediye. 2- İhale konusu malın adı: Kırtasiye alımı.");

        // Most mal alımı announcements carry no such section at all, and "this tender does not ask"
        // must not look like "we failed to read it".
        assertThat(qualification.present()).isFalse();
        assertThat(qualification.experienceRatioPercent()).isNull();
    }

    @Test
    void anEmptyBodyIsNotAnException() {
        assertThat(TenderQualification.parse(null).present()).isFalse();
        assertThat(TenderQualification.parse("   ").present()).isFalse();
    }
}
