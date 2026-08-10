package com.docsbot.ops.bulletin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.TenderCategory;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderWatchProfile;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderWatchProfileRepository;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.application.NotificationService;

/**
 * What the company watches for, and the morning line that says whether any of it turned up.
 *
 * <p>Three hundred announcements are published every working day and a company can bid on perhaps
 * six. Filtering by hand only happens on the mornings somebody remembers; recorded once, it happens
 * every morning — which is the difference between a screen people visit and a product that works
 * while they are doing something else.
 */
@Service
@Profile("postgres")
public class TenderWatchService {

    private static final Logger log = LoggerFactory.getLogger(TenderWatchService.class);

    static final String NOTIFICATION_TYPE = "tender_bulletin_daily";
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    /** Enough to say what the day holds without turning a notification into a list. */
    private static final int NAMED_IN_SUMMARY = 2;

    private final TenderWatchProfileRepository profileRepository;
    private final TenderNoticeRepository noticeRepository;
    private final NotificationService notificationService;
    private final ErpUserRepository userRepository;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public TenderWatchService(
            TenderWatchProfileRepository profileRepository,
            TenderNoticeRepository noticeRepository,
            NotificationService notificationService,
            ErpUserRepository userRepository
    ) {
        this(profileRepository, noticeRepository, notificationService, userRepository, Clock.systemUTC());
    }

    TenderWatchService(
            TenderWatchProfileRepository profileRepository,
            TenderNoticeRepository noticeRepository,
            NotificationService notificationService,
            ErpUserRepository userRepository,
            Clock clock
    ) {
        this.profileRepository = profileRepository;
        this.noticeRepository = noticeRepository;
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TenderWatchProfile profile() {
        return profileRepository.findFirstByOrderByIdAsc().orElse(null);
    }

    @Transactional
    public TenderWatchProfile save(List<String> categories, List<String> provinces,
                                   boolean notifyDaily, String updatedBy) {
        TenderWatchProfile profile = profileRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new IllegalStateException("İhale profili bulunamadı"));
        // Unknown category codes are dropped rather than stored: a code that no longer exists
        // filters everything out and looks exactly like "there are no tenders today".
        List<String> known = categories == null ? List.of()
                : categories.stream().filter(TenderCategory::isKnownCode).toList();
        profile.update(known, provinces, notifyDaily, updatedBy, clock.instant());
        return profile;
    }

    /** The announcements this company watches for, out of the ones already open. */
    public List<TenderNotice> matching(List<TenderNotice> open, TenderWatchProfile profile) {
        if (profile == null || profile.watchesEverything()) {
            return open;
        }
        Set<String> categories = Set.copyOf(profile.categoryCodes());
        Set<String> provinces = Set.copyOf(profile.provinceNames());
        return open.stream()
                // Empty on an axis means every value of it, so the two narrow together rather than
                // one of them emptying the screen on its own.
                .filter(notice -> categories.isEmpty() || categories.contains(notice.getCategory()))
                .filter(notice -> provinces.isEmpty()
                        || (notice.getProvince() != null && provinces.contains(notice.getProvince())))
                .toList();
    }

    /**
     * Tells everyone what today's bulletin holds for this company. Called by the ingest job, once
     * the day's announcements are in.
     *
     * @return how many notifications were created
     */
    @Transactional
    public int announceToday() {
        TenderWatchProfile profile = profile();
        if (profile == null || !profile.isNotifyDaily()) {
            return 0;
        }
        if (profile.watchesEverything()) {
            // Nothing has been narrowed yet, so "your" tenders are all three hundred of them, and
            // the line would read "bugün size uygun 254 ihale var" — which is not news, it is the
            // bulletin. Announcing that every morning is how a notification gets switched off, and
            // this project has already had one badge people learned to ignore.
            return 0;
        }
        Instant now = clock.instant();
        List<TenderNotice> mine = matching(noticeRepository.findOpen(now, null, null, null), profile);
        if (mine.isEmpty()) {
            // Silence on a day with nothing is the point of the filter. A notification saying "0
            // tenders" every morning is a notification people turn off, and then they miss the day
            // there were four.
            return 0;
        }
        LocalDate today = LocalDate.ofInstant(now, BUSINESS_ZONE);
        String body = summarise(mine);
        int sent = 0;
        for (ErpUser user : userRepository.findAllByOrderByNameAscIdAsc()) {
            sent += notificationService.notifyUsers(
                    List.of(user.getId()),
                    NOTIFICATION_TYPE,
                    "Bugün size uygun " + mine.size() + " ihale var",
                    body,
                    null,
                    "NORMAL",
                    // One per user per day: the ingest can run again after a failure, and a second
                    // run must not tell everybody twice.
                    NOTIFICATION_TYPE + ":" + today,
                    now);
        }
        log.info("tender_watch_announced matching={} notified={}", mine.size(), sent);
        return sent;
    }

    /** Two of them by name and the rest as a number — enough to decide whether to open the app. */
    private static String summarise(List<TenderNotice> mine) {
        StringBuilder body = new StringBuilder();
        for (int index = 0; index < Math.min(NAMED_IN_SUMMARY, mine.size()); index++) {
            TenderNotice notice = mine.get(index);
            if (index > 0) {
                body.append(" · ");
            }
            body.append(abbreviate(notice.getTitle()));
            if (notice.getProvince() != null) {
                body.append(" (").append(notice.getProvince()).append(")");
            }
        }
        if (mine.size() > NAMED_IN_SUMMARY) {
            body.append(" · +").append(mine.size() - NAMED_IN_SUMMARY).append(" ihale daha");
        }
        return body.toString();
    }

    private static String abbreviate(String title) {
        if (title == null || title.isBlank()) {
            return "(adı okunamayan ilan)";
        }
        String trimmed = title.strip();
        return trimmed.length() <= 60 ? trimmed : trimmed.substring(0, 57) + "…";
    }
}
