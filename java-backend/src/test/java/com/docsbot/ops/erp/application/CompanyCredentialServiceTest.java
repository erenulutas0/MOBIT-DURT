package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.docsbot.ops.erp.infrastructure.CompanyCredentialRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The company's own paperwork expires, and finding that out while assembling a bid is too late.
 * These tests are about when the warning arrives and how often it repeats — a reminder people learn
 * to swipe away is the same as no reminder.
 */
@SpringBootTest
@ActiveProfiles("postgres")
class CompanyCredentialServiceTest {

    @Autowired
    private CompanyCredentialRepository repository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final LocalDate TODAY = LocalDate.of(2026, 8, 10);

    private CompanyCredentialService serviceAt(LocalDate today) {
        Clock clock = Clock.fixed(today.atTime(9, 0).atZone(ISTANBUL).toInstant(), ISTANBUL);
        return new CompanyCredentialService(repository, notificationService, clock);
    }

    @BeforeEach
    void reset() {
        repository.deleteAll();
        jdbcTemplate.update("delete from erp_notifications where type = ?",
                CompanyCredentialService.EXPIRY_TYPE);
    }

    private long alertCount() {
        return jdbcTemplate.queryForObject(
                "select count(*) from erp_notifications where type = ?", Long.class,
                CompanyCredentialService.EXPIRY_TYPE);
    }

    @Test
    void aDocumentLapsingSoonIsWarnedAbout() {
        serviceAt(TODAY).create("İmza Sirküleri", "imza", null, TODAY.plusDays(12), null, null);

        assertThat(serviceAt(TODAY).notifyExpiring()).isEqualTo(1);
        assertThat(alertCount()).isEqualTo(1);
    }

    @Test
    void theSameStepIsNotWarnedAboutTwice() {
        serviceAt(TODAY).create("İmza Sirküleri", "imza", null, TODAY.plusDays(12), null, null);

        serviceAt(TODAY).notifyExpiring();
        serviceAt(TODAY).notifyExpiring();

        // A daily scan must not produce a daily alert: one people swipe away every morning is one
        // they will also swipe away on the day it matters.
        assertThat(alertCount()).isEqualTo(1);
    }

    @Test
    void eachThresholdWarnsAgainAsTheDateGetsCloser() {
        serviceAt(TODAY).create("Oda Kayıt Belgesi", "oda", null, TODAY.plusDays(30), null, null);

        serviceAt(TODAY).notifyExpiring();                      // 30 days out
        serviceAt(TODAY.plusDays(20)).notifyExpiring();         // 10 days out
        serviceAt(TODAY.plusDays(29)).notifyExpiring();         // 1 day out

        // Spaced, not silent: renewing takes weeks, so the first warning is early and the last is
        // impossible to miss.
        assertThat(alertCount()).isEqualTo(3);
    }

    @Test
    void renewingToANewDateStartsTheWarningsOver() {
        var credential = serviceAt(TODAY)
                .create("SGK Borcu Yoktur", "sgk", null, TODAY.plusDays(5), null, null);
        serviceAt(TODAY).notifyExpiring();
        long afterFirst = alertCount();

        serviceAt(TODAY).update(credential.getId(), "SGK Borcu Yoktur", "sgk", null,
                TODAY.plusDays(200), null, null);
        serviceAt(TODAY.plusDays(195)).notifyExpiring();

        // The event key carries the expiry date, so a renewed document is a fresh subject rather
        // than one already reported on.
        assertThat(alertCount()).isEqualTo(afterFirst + 1);
    }

    @Test
    void anExpiredDocumentIsChasedOnceRatherThanEveryMorning() {
        serviceAt(TODAY).create("Ticaret Sicil Gazetesi", "sicil", null, TODAY.minusDays(3), null, null);

        serviceAt(TODAY).notifyExpiring();
        serviceAt(TODAY.plusDays(1)).notifyExpiring();
        serviceAt(TODAY.plusDays(2)).notifyExpiring();

        assertThat(alertCount()).isEqualTo(1);
    }

    @Test
    void aDocumentWithNoExpiryIsNeverUrgent() {
        serviceAt(TODAY).create("Vergi Levhası", "vergi", null, null, null, null);

        assertThat(serviceAt(TODAY).notifyExpiring()).isZero();
        assertThat(repository.findAllByUrgency().get(0).daysRemaining(TODAY)).isNull();
    }

    @Test
    void theListPutsWhatNeedsAttentionFirstAndTheOpenEndedOnesLast() {
        CompanyCredentialService service = serviceAt(TODAY);
        service.create("Süresiz Belge", null, null, null, null, null);
        service.create("Uzak Tarihli", null, null, TODAY.plusDays(90), null, null);
        service.create("Yakın Tarihli", null, null, TODAY.plusDays(3), null, null);

        // A null expiry sorts before every real date by default, which would put the documents
        // that never need attention at the top of a screen that exists to show what does.
        assertThat(repository.findAllByUrgency())
                .extracting(credential -> credential.getName())
                .containsExactly("Yakın Tarihli", "Uzak Tarihli", "Süresiz Belge");
    }

    @Test
    void aDocumentWithoutANameIsRefused() {
        CompanyCredentialService service = serviceAt(TODAY);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.create("   ", null, null, TODAY.plusDays(5), null, null))
                .isInstanceOf(ErpExceptions.BadRequest.class);
    }

    @Test
    void expiryAlertsAreRetirableSoTheyDoNotPileUpForever() {
        // Machine-generated and about a date that has passed — unlike a colleague's message, which
        // is still unread mail after two weeks of leave.
        assertThat(NotificationService.EXPIRING_ALERT_TYPES)
                .contains(CompanyCredentialService.EXPIRY_TYPE);
    }

    @Test
    void dayCountsFollowIstanbulRatherThanWhereverTheServerIs() {
        // 22:00 UTC on the 10th is already the 11th in Istanbul. A document expiring on the 11th
        // has one day left by UTC and none by the calendar the deadline actually follows.
        Clock lateUtc = Clock.fixed(Instant.parse("2026-08-10T22:00:00Z"), ZoneId.of("UTC"));
        CompanyCredentialService service =
                new CompanyCredentialService(repository, notificationService, lateUtc);
        service.create("Gece Yarısı Belgesi", null, null, LocalDate.of(2026, 8, 11), null, null);

        service.notifyExpiring();

        assertThat(jdbcTemplate.queryForObject(
                "select body from erp_notifications where type = ? order by id desc limit 1",
                String.class, CompanyCredentialService.EXPIRY_TYPE))
                .contains("Bugün son geçerlilik günü");
    }
}
