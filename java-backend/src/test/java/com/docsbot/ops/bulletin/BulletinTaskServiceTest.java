package com.docsbot.ops.bulletin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.ErpService;
import com.docsbot.ops.erp.domain.ErpTask;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A tender closes at a stated hour and the preparation takes days. What matters here is that the
 * task carries that hour — the reminder ladder counts down to it — and that two people reading the
 * same bulletin do not each open the same job.
 */
class BulletinTaskServiceTest {

    private static final Instant TENDER_AT = Instant.parse("2026-08-24T08:30:00Z");

    private final TenderNoticeRepository notices = mock(TenderNoticeRepository.class);
    private final ErpService erpService = mock(ErpService.class);
    private final BulletinTaskService service = new BulletinTaskService(notices, erpService);
    private final ErpPrincipal admin = new ErpPrincipal(true, OptionalLong.of(1L), "admin", "Admin");

    private ErpTask created;

    @BeforeEach
    void setUp() {
        created = mock(ErpTask.class);
        when(created.getId()).thenReturn(42L);
        when(erpService.createTask(any(), anyString(), anyString(), any(), any(), any(), any(),
                anyString(), any(), any(), any(), any())).thenReturn(created);
    }

    @Test
    void theTaskIsDueWhenTheTenderCloses() {
        when(notices.findById(7L)).thenReturn(Optional.of(notice()));

        service.openTask(admin, 7L, List.of(3L), null);

        ArgumentCaptor<Instant> deadline = ArgumentCaptor.forClass(Instant.class);
        verify(erpService).createTask(any(), anyString(), anyString(), any(), any(), any(), any(),
                anyString(), deadline.capture(), any(), any(), any());
        // Teklifler close at the tender hour, so the ladder that already exists is counting down to
        // the real thing. An earlier "internal" deadline would be a number somebody invented, and
        // every alert would then be about that invention.
        assertThat(deadline.getValue()).isEqualTo(TENDER_AT);
    }

    @Test
    void theTaskCarriesEnoughToStartWithoutTheBulletin() {
        when(notices.findById(7L)).thenReturn(Optional.of(notice()));

        service.openTask(admin, 7L, List.of(), null);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> description = ArgumentCaptor.forClass(String.class);
        verify(erpService).createTask(any(), title.capture(), description.capture(), any(), any(),
                any(), any(), anyString(), any(), any(), any(), any());
        assertThat(title.getValue()).startsWith("İhale hazırlığı: ").contains("Orta gerilim kablo");
        // The İKN is what somebody types into EKAP when they need the original document.
        assertThat(description.getValue())
                .contains("İKN: 2026/1434625")
                .contains("Siirt İl Özel İdaresi")
                .contains("24.08.2026 - 11:30");
    }

    @Test
    void aSecondClickDoesNotOpenASecondTask() {
        TenderNotice already = notice();
        already.attachTask(99L);
        when(notices.findById(7L)).thenReturn(Optional.of(already));

        // Two people reading the same bulletin on the same morning is the normal case.
        assertThatThrownBy(() -> service.openTask(admin, 7L, List.of(), null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("#99");
        verify(erpService, never()).createTask(any(), anyString(), anyString(), any(), any(), any(),
                any(), anyString(), any(), any(), any(), any());
    }

    @Test
    void theNoticeRemembersItsTask() {
        TenderNotice notice = notice();
        when(notices.findById(7L)).thenReturn(Optional.of(notice));

        service.openTask(admin, 7L, List.of(), null);

        // Without this the screen cannot say the work is already under way, and the next person
        // opens it again.
        assertThat(notice.getTaskId()).isEqualTo(42L);
    }

    @Test
    void aTenderWithNoReadableDateStillGetsATask() {
        TenderNotice undated = new TenderNotice("2026/9", "yapim", LocalDate.of(2026, 8, 10), "ilan",
                "İHALE İLANLARI", "Bir İdare", "Adres", "Siirt", "belirtilmemiştir", null,
                "Orta gerilim kablo alımı", "12 km", "Siirt", "gövde", Instant.now());
        when(notices.findById(7L)).thenReturn(Optional.of(undated));

        service.openTask(admin, 7L, List.of(), null);

        ArgumentCaptor<Instant> deadline = ArgumentCaptor.forClass(Instant.class);
        verify(erpService).createTask(any(), anyString(), anyString(), any(), any(), any(), any(),
                anyString(), deadline.capture(), any(), any(), any());
        // A deadline nobody could read is left empty rather than guessed at. The task still exists,
        // and somebody can put the date in once they have opened the announcement.
        assertThat(deadline.getValue()).isNull();
    }

    @Test
    void aMissingNoticeIsReportedRatherThanCreatingAnEmptyTask() {
        when(notices.findById(7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openTask(admin, 7L, List.of(), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static TenderNotice notice() {
        return new TenderNotice("2026/1434625", "mal", LocalDate.of(2026, 8, 10), "ilan",
                "İHALE İLANLARI", "Siirt İl Özel İdaresi", "Bir adres", "Siirt",
                "24.08.2026 - 11:30", TENDER_AT, "Orta gerilim kablo ve trafo alımı",
                "12 km kablo", "Siirt", "gövde metni", Instant.now());
    }
}
