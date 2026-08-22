package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import com.docsbot.ops.bulletin.domain.TenderBid;
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderBidRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What the retention window may and may not take with it.
 *
 * <p>A bid's outcome is not stored — it is worked out on every read by matching the İKN against the
 * results table. So deleting a result four months on silently turned a settled bid back into "sonuç
 * ilanı henüz yayımlanmadı": the loss count dropped, the rival who beat us lost a tally mark, and
 * once the remaining losses fell under three the median gap disappeared altogether, with nothing
 * having happened to cause it.
 */
@SpringBootTest
@ActiveProfiles("postgres")
class ResultRetentionIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-08-22T06:00:00Z");
    /** Comfortably outside any retention window this project uses. */
    private static final LocalDate LONG_AGO = LocalDate.of(2026, 1, 5);

    @Autowired
    private TenderResultRepository resultRepository;

    @Autowired
    private TenderBidRepository bidRepository;

    @BeforeEach
    void clear() {
        resultRepository.deleteAll();
        bidRepository.deleteAll();
    }

    @Test
    void anOldResultGoesUnlessTheCompanyBidOnThatTender() {
        resultRepository.save(result("2026/111111"));
        resultRepository.save(result("2026/222222"));
        // The company competed for the second one and remembers what it offered.
        bidRepository.save(new TenderBid(
                "2026/222222", 9L, "Köy yolu asfalt işi", "Karayolları", "Konya", "insaat",
                new BigDecimal("8250000.00"), "TRY", LocalDate.of(2026, 1, 2), null, "Eren", NOW));

        int deleted = resultRepository.deleteOlderThan(LocalDate.of(2026, 6, 1));

        assertThat(deleted).isEqualTo(1);
        assertThat(resultRepository.findByIkn("2026/111111")).isEmpty();
        // Kept, because without it the bid silently reverts to "awaiting a result" for ever.
        assertThat(resultRepository.findByIkn("2026/222222")).hasSize(1);
    }

    @Test
    void aTenderNobodyBidOnIsStillPruned() {
        resultRepository.save(result("2026/333333"));

        assertThat(resultRepository.deleteOlderThan(LocalDate.of(2026, 6, 1))).isEqualTo(1);
        assertThat(resultRepository.count()).isZero();
    }

    private static TenderResult result(String ikn) {
        return new TenderResult(
                ikn, "yapim", LONG_AGO,
                "KARAYOLLARI GENEL MÜDÜRLÜĞÜ", "Köy yolu asfalt işi",
                "Konya", "Konya", "Açık",
                LONG_AGO.minusDays(20), LONG_AGO.minusDays(2),
                new BigDecimal("9000000.00"), "TRY", new BigDecimal("8000000.00"), "TRY", 12, 9,
                "Sürekli Rakip A.Ş.", "Selçuklu/Konya", "Konya",
                false, "1- İhalenin ...", NOW);
    }
}
