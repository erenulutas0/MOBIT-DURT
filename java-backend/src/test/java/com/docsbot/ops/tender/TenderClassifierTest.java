package com.docsbot.ops.tender;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TenderClassifierTest {

    private final TenderClassifier classifier = new TenderClassifier();

    @Test
    void detectsTurkishTechnicalSpecification() {
        assertEquals(
                "technical_spec",
                classifier.documentType(
                        "BEDAŞ-2026-teknik-şartname.pdf",
                        null));
    }

    @Test
    void detectsCamelCaseDocumentType() {
        assertEquals(
                "administrative_spec",
                classifier.documentType(
                        "2026IdariSartname.docx",
                        null));
    }

    @Test
    void normalizesOrganizationAndFallsBackToUnknown() {
        assertEquals("IGDAS", classifier.normalizeCode("İGDAŞ"));
        assertEquals(
                "unknown",
                classifier.documentType("maliyet-tablosu.xlsx", "genel ek"));
    }

}
