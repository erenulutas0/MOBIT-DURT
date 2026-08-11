package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.application.NotificationService;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The end of the loop the bulletin opens: a tender is announced, somebody opens a task for it, and
 * weeks later the result is published. The properties worth holding are about restraint — only the
 * tenders this company was actually working on, and only once each however many times a bulletin
 * is re-read.
 */
class TenderResultWatcherTest {

    private static final Instant NOW = Instant.parse("2026-08-11T06:00:00Z");

    private final TenderNoticeRepository noticeRepository = mock(TenderNoticeRepository.class);
    private final ErpTaskAssignmentRepository assignmentRepository =
            mock(ErpTaskAssignmentRepository.class);
    private final NotificationService notificationService = mock(NotificationService.class);

    private final TenderResultWatcher watcher = new TenderResultWatcher(
            noticeRepository, assignmentRepository, notificationService,
            Clock.fixed(NOW, ZoneOffset.UTC));

    private static TenderResult result(BigDecimal estimate, BigDecimal amount, boolean lots) {
        return new TenderResult(
                "2026/951756", "yapim", LocalDate.of(2026, 8, 11),
                "TCDD 3. BÖLGE MÜDÜRLÜĞÜ", "Açık stok alanlarının yapılması işi",
                "İzmir", "Aliağa İstasyonu", "Açık",
                LocalDate.of(2026, 6, 30), LocalDate.of(2026, 8, 7),
                estimate, "TRY", amount, "TRY", 45, 31,
                "Tavsun Enerji A.Ş.", "Yenişehir/Diyarbakır", "Diyarbakır",
                lots, "1- İhalenin ...", NOW);
    }

    /**
     * Built outside any other stubbing on purpose: a {@code when()} evaluated inside another
     * {@code when()}'s argument list is what Mockito reports as UnfinishedStubbing.
     */
    private static ErpTaskAssignment assignedTo(long userId) {
        ErpTaskAssignment assignment = mock(ErpTaskAssignment.class);
        when(assignment.getAssigneeUserId()).thenReturn(userId);
        return assignment;
    }

    @Test
    void tellsThePeopleWhoPreparedTheBidWhoWonAndForHowMuch() {
        when(noticeRepository.findTaskIdsByIkn("2026/951756")).thenReturn(List.of(42L));
        List<ErpTaskAssignment> assignments = List.of(assignedTo(7L), assignedTo(9L));
        when(assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.of(42L))).thenReturn(assignments);

        watcher.announce(result(new BigDecimal("82368000.00"), new BigDecimal("54524045.00"), false));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        // A Set, and deliberately: two assignments naming the same person must not notify twice.
        verify(notificationService).notifyUsers(
                eq(new LinkedHashSet<>(List.of(7L, 9L))), eq("tender_result"), anyString(), body.capture(),
                eq(42L), anyString(), anyString(), eq(NOW));
        assertThat(body.getValue()).contains("Tavsun Enerji A.Ş.");
        assertThat(body.getValue()).contains("%33.8 kırım");
        // Carried so the notification opens the preparation task, where the bid's own paperwork is.
        verify(notificationService).notifyAdmin(
                eq("tender_result"), anyString(), anyString(), eq(42L),
                anyString(), anyString(), eq(NOW));
    }

    @Test
    void saysNothingAboutTendersThisCompanyNeverWorkedOn() {
        when(noticeRepository.findTaskIdsByIkn(anyString())).thenReturn(List.of());

        assertThat(watcher.announce(result(new BigDecimal("100.00"), new BigDecimal("90.00"), false)))
                .isZero();

        // Three hundred announcements a day scroll past this company's screen. Announcing every
        // result would be the bulletin again, and this project has already had one badge people
        // learned to ignore.
        verify(notificationService, never()).notifyUsers(
                anyCollection(), anyString(), anyString(), anyString(), any(), anyString(),
                anyString(), any());
        verify(notificationService, never()).notifyAdmin(
                anyString(), anyString(), anyString(), any(), anyString(), anyString(), any());
    }

    @Test
    void aLotAwardIsAnnouncedWithoutAnInventedDiscount() {
        when(noticeRepository.findTaskIdsByIkn("2026/951756")).thenReturn(List.of(42L));
        List<ErpTaskAssignment> assignments = List.of(assignedTo(7L));
        when(assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.of(42L))).thenReturn(assignments);

        watcher.announce(result(new BigDecimal("1619588.74"), new BigDecimal("25130.00"), true));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(notificationService).notifyUsers(
                anyCollection(), anyString(), anyString(), body.capture(),
                any(), anyString(), anyString(), any());
        // One lot's price against the whole tender's estimate is a 98% saving and pure fiction.
        assertThat(body.getValue()).doesNotContain("kırım");
        assertThat(body.getValue()).contains("kısımlara bölünmüş");
    }

    @Test
    void reReadingTheBulletinDoesNotAnnounceItTwice() {
        when(noticeRepository.findTaskIdsByIkn("2026/951756")).thenReturn(List.of(42L));
        List<ErpTaskAssignment> assignments = List.of(assignedTo(7L));
        when(assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.of(42L))).thenReturn(assignments);

        watcher.announce(result(new BigDecimal("100.00"), new BigDecimal("90.00"), false));

        // The suppression is the event key's job, so what this holds is that a key is passed and
        // that it names the tender and the task rather than, say, the day.
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(notificationService).notifyUsers(
                anyCollection(), anyString(), anyString(), anyString(), any(), anyString(),
                key.capture(), any());
        assertThat(key.getValue()).isEqualTo("tender_result:2026/951756:task:42");
    }
}
