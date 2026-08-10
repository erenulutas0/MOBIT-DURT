package com.docsbot.ops.bulletin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderWatchProfile;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderWatchProfileRepository;
import com.docsbot.ops.erp.application.NotificationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The profile decides what three hundred daily announcements are narrowed to, and what the morning
 * notification says. Both directions are worth pinning: a filter that is too tight hides the tender
 * somebody needed, and one that is too loose is the pile they were trying to escape.
 */
class TenderWatchServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-10T06:30:00Z");

    private final TenderWatchProfileRepository profiles = mock(TenderWatchProfileRepository.class);
    private final TenderNoticeRepository notices = mock(TenderNoticeRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ErpUserRepository users = mock(ErpUserRepository.class);

    private final TenderWatchService service = new TenderWatchService(
            profiles, notices, notifications, users, Clock.fixed(NOW, ZoneOffset.UTC));

    private TenderWatchProfile profile;

    @BeforeEach
    void setUp() throws Exception {
        profile = newProfile();
        // Built before the stubbing below, not inside its argument list: a when() evaluated while
        // another when() is open is what Mockito calls UnfinishedStubbing.
        List<ErpUser> everyone = List.of(user(7L), user(9L));
        when(profiles.findFirstByOrderByIdAsc()).thenReturn(Optional.of(profile));
        when(users.findAllByOrderByNameAscIdAsc()).thenReturn(everyone);
    }

    @Test
    void anUntouchedProfileWatchesEverything() {
        List<TenderNotice> open = List.of(
                notice("2026/1", "elektrik", "Ankara"), notice("2026/2", "gida", "Siirt"));

        // A company that has not filled the form in sees the whole bulletin, exactly as it did
        // before the form existed. Showing nothing until somebody configures it is how a feature
        // gets a reputation for being broken.
        assertThat(service.matching(open, profile)).hasSize(2);
    }

    @Test
    void theTwoAxesNarrowTogether() {
        profile.update(List.of("elektrik"), List.of("Ankara"), true, "admin", NOW);
        List<TenderNotice> open = List.of(
                notice("2026/1", "elektrik", "Ankara"),
                notice("2026/2", "elektrik", "Siirt"),
                notice("2026/3", "gida", "Ankara"));

        assertThat(service.matching(open, profile)).extracting(TenderNotice::getIkn)
                .containsExactly("2026/1");
    }

    @Test
    void anEmptyAxisMeansEveryValueOfIt() {
        profile.update(List.of("elektrik"), List.of(), true, "admin", NOW);
        List<TenderNotice> open = List.of(
                notice("2026/1", "elektrik", "Ankara"),
                notice("2026/2", "elektrik", "Siirt"),
                notice("2026/3", "gida", "Ankara"));

        // Picking a line of work but no province means that work anywhere, not that work nowhere.
        assertThat(service.matching(open, profile)).extracting(TenderNotice::getIkn)
                .containsExactly("2026/1", "2026/2");
    }

    @Test
    void anAnnouncementWithNoProvinceIsNotSmuggledThroughAProvinceFilter() {
        profile.update(List.of(), List.of("Ankara"), true, "admin", NOW);
        List<TenderNotice> open = List.of(
                notice("2026/1", "elektrik", "Ankara"), notice("2026/2", "elektrik", null));

        assertThat(service.matching(open, profile)).extracting(TenderNotice::getIkn)
                .containsExactly("2026/1");
    }

    @Test
    void aCodeTheTableNoLongerKnowsIsNotSaved() {
        service.save(List.of("elektrik", "uzay-madenciligi"), List.of("Ankara"), true, "admin");

        // A saved filter holding a dead code matches nothing, and an empty screen with no
        // explanation is indistinguishable from a quiet day.
        assertThat(profile.categoryCodes()).containsExactly("elektrik");
    }

    @Test
    void everybodyIsToldWhatTodayHolds() {
        profile.update(List.of("elektrik"), List.of(), true, "admin", NOW);
        when(notices.findOpen(any(), any(), any(), any())).thenReturn(List.of(
                notice("2026/1", "elektrik", "Ankara"),
                notice("2026/2", "elektrik", "Siirt"),
                notice("2026/3", "gida", "Ankara")));

        service.announceToday();

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> eventKey = ArgumentCaptor.forClass(String.class);
        verify(notifications, org.mockito.Mockito.times(2)).notifyUsers(
                any(), eq(TenderWatchService.NOTIFICATION_TYPE), title.capture(), body.capture(),
                any(), anyString(), eventKey.capture(), any());
        assertThat(title.getValue()).isEqualTo("Bugün size uygun 2 ihale var");
        assertThat(body.getValue()).contains("Ankara").contains("Siirt");
        // One per user per day: the ingest can run again after a failure, and the second run must
        // not tell everybody twice.
        assertThat(eventKey.getValue()).endsWith(LocalDate.of(2026, 8, 10).toString());
    }

    @Test
    void adayWithNothingMatchingSaysNothingAtAll() {
        profile.update(List.of("elektrik"), List.of(), true, "admin", NOW);
        when(notices.findOpen(any(), any(), any(), any()))
                .thenReturn(List.of(notice("2026/3", "gida", "Ankara")));

        service.announceToday();

        // "0 tenders today" every morning is a notification people switch off, and then they miss
        // the morning there were four.
        verify(notifications, never()).notifyUsers(any(), anyString(), anyString(), anyString(),
                any(), anyString(), anyString(), any());
    }

    @Test
    void switchingTheDailyLineOffStopsIt() {
        profile.update(List.of("elektrik"), List.of(), false, "admin", NOW);
        when(notices.findOpen(any(), any(), any(), any()))
                .thenReturn(List.of(notice("2026/1", "elektrik", "Ankara")));

        assertThat(service.announceToday()).isZero();
        // Narrowing the screen and being woken up about it are different appetites.
        verify(notices, never()).findOpen(any(), any(), any(), any());
    }

    private static TenderWatchProfile newProfile() throws Exception {
        var constructor = TenderWatchProfile.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        return constructor.newInstance();
    }

    private static ErpUser user(long id) {
        ErpUser user = mock(ErpUser.class);
        when(user.getId()).thenReturn(id);
        return user;
    }

    private static TenderNotice notice(String ikn, String category, String province) {
        return new TenderNotice(ikn, "yapim", LocalDate.of(2026, 8, 10), "ilan", "İHALE İLANLARI",
                "Bir İdare", "Bir adres", province, "26.08.2026 - 10:00", NOW.plusSeconds(86400),
                categoryTitle(category), "1 adet", "Merkez", "gövde", NOW);
    }

    /** A title the classifier will file under the category the test wants. */
    private static String categoryTitle(String category) {
        return switch (category) {
            case "elektrik" -> "Orta gerilim kablo ve trafo alımı";
            case "gida" -> "Malzemeli yemek hizmeti alımı";
            default -> "Muhtelif malzeme alımı";
        };
    }
}
