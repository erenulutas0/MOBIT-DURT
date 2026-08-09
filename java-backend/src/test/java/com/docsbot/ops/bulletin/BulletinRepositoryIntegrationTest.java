package com.docsbot.ops.bulletin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Against real Postgres, because that is where the interesting parts are: the unique constraint
 * that makes a re-run safe, the ordering that puts undated announcements last, and the counts the
 * map and the category filter are drawn from.
 */
@SpringBootTest
@ActiveProfiles("postgres")
class BulletinRepositoryIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-08-09T06:00:00Z");
    private static final LocalDate BULLETIN_DATE = LocalDate.of(2026, 8, 7);

    @Autowired
    private TenderNoticeRepository repository;

    @BeforeEach
    void clear() {
        repository.deleteAll();
    }

    @Test
    void servesOnlyLiveAnnouncementsSoonestFirst() {
        save("2026/1", "ilan", "Siirt", NOW.plusSeconds(7200), "Yakın ihale");
        save("2026/2", "ilan", "Ankara", NOW.plusSeconds(864000), "Uzak ihale");
        save("2026/3", "ilan", "İzmir", NOW.minusSeconds(3600), "Süresi geçmiş ihale");
        save("2026/4", "iptal", "Bursa", NOW.plusSeconds(7200), "İptal edilmiş ihale");
        save("2026/5", "ilan", "Konya", null, "Tarihi okunamayan ihale");

        List<TenderNotice> open = repository.findOpen(NOW, null, null, null);

        // Cancelled is gone, expired is gone, and the one whose date could not be read is kept but
        // sorted last — an announcement nobody can date is still an announcement.
        assertThat(open).extracting(TenderNotice::getIkn)
                .containsExactly("2026/1", "2026/2", "2026/5");
    }

    @Test
    void filtersNarrowWithoutEachOtherLettingTheOthersThrough() {
        save("2026/1", "ilan", "Siirt", NOW.plusSeconds(7200), "Köy yolu asfalt yapım işi");
        save("2026/2", "ilan", "Siirt", NOW.plusSeconds(7200), "Orta gerilim kablo alımı");
        save("2026/3", "ilan", "Ankara", NOW.plusSeconds(7200), "Köy yolu asfalt yapım işi");

        assertThat(repository.findOpen(NOW, "Siirt", null, null)).hasSize(2);
        assertThat(repository.findOpen(NOW, null, "elektrik", null)).extracting(TenderNotice::getIkn)
                .containsExactly("2026/2");
        assertThat(repository.findOpen(NOW, "Siirt", "insaat", null)).extracting(TenderNotice::getIkn)
                .containsExactly("2026/1");
        // No filters at all is the whole list, not an empty one — the null checks in the query are
        // what make one filter usable without the others.
        assertThat(repository.findOpen(NOW, null, null, null)).hasSize(3);
    }

    @Test
    void countsWhatTheMapAndTheCategoryChipsAreDrawnFrom() {
        save("2026/1", "ilan", "Siirt", NOW.plusSeconds(7200), "Köy yolu asfalt yapım işi");
        save("2026/2", "ilan", "Siirt", NOW.plusSeconds(7200), "Beton bordür alımı");
        save("2026/3", "ilan", "Ankara", NOW.plusSeconds(7200), "Orta gerilim kablo alımı");
        save("2026/4", "iptal", "Ankara", NOW.plusSeconds(7200), "İptal edilmiş asfalt işi");
        save("2026/5", "ilan", null, NOW.plusSeconds(7200), "Muhtelif malzeme alımı");

        Map<String, Long> byProvince = counts(repository.countOpenByProvince(NOW));
        // The province-less announcement is left out rather than counted as a province of its own.
        assertThat(byProvince).containsExactly(Map.entry("Siirt", 2L), Map.entry("Ankara", 1L));

        Map<String, Long> byCategory = counts(repository.countOpenByCategory(NOW));
        assertThat(byCategory).containsEntry("insaat", 2L).containsEntry("elektrik", 1L);
        // The cancellation is excluded from both, so nothing counts a tender nobody can bid on.
        assertThat(byCategory.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(4);
    }

    @Test
    void theSameAnnouncementInTheSameBulletinIsRecognisedOnASecondRun() {
        save("2026/1", "ilan", "Siirt", NOW.plusSeconds(7200), "Köy yolu asfalt yapım işi");

        assertThat(repository.existsByIknAndKindAndBulletinDateAndBulletinType(
                "2026/1", "ilan", BULLETIN_DATE, "yapim")).isTrue();
        // The same İKN as a cancellation is a different row: a tender being withdrawn is news.
        assertThat(repository.existsByIknAndKindAndBulletinDateAndBulletinType(
                "2026/1", "iptal", BULLETIN_DATE, "yapim")).isFalse();
        assertThat(repository.countByBulletinDateAndBulletinType(BULLETIN_DATE, "yapim")).isEqualTo(1);
    }

    @Test
    void oldBulletinsCanActuallyBeDeleted() {
        repository.save(new TenderNotice(
                "2026/9", "yapim", LocalDate.of(2026, 1, 15), "ilan", "İHALE İLANLARI", "Bir İdare",
                "Bir adres", "Siirt", "", null, "Eski ihale", "", "", "gövde", NOW));
        save("2026/10", "ilan", "Siirt", NOW.plusSeconds(7200), "Yeni ihale");

        int deleted = repository.deleteOlderThan(LocalDate.of(2026, 4, 1));

        // Run against a real database because that is the only place the bug lives: a modifying
        // query with no transaction throws, and it throws at three in the morning inside a
        // scheduled job. A mocked repository answers happily and proves nothing.
        assertThat(deleted).isEqualTo(1);
        assertThat(repository.findAll()).extracting(TenderNotice::getIkn).containsExactly("2026/10");
    }

    private static Map<String, Long> counts(List<Object[]> rows) {
        return rows.stream().collect(Collectors.toMap(
                row -> (String) row[0],
                row -> ((Number) row[1]).longValue(),
                (first, second) -> first,
                java.util.LinkedHashMap::new));
    }

    private void save(String ikn, String kind, String province, Instant tenderAt, String title) {
        repository.save(new TenderNotice(
                ikn, "yapim", BULLETIN_DATE, kind, "İHALE İLANLARI", "Bir İdare", "Bir adres",
                province, tenderAt == null ? "" : "26.08.2026 - 10:00", tenderAt, title,
                "1 adet", "Merkez", title + " gövde metni", NOW));
    }
}
