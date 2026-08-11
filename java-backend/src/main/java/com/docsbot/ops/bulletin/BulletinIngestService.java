package com.docsbot.ops.bulletin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Brings the day's Kamu İhale Bülteni into the database.
 *
 * <p>The reading is done by the sidecar — poppler lives there, and the bulletin is the same public
 * document for every customer, so it is fetched once and shared rather than once per tenant. This
 * side decides what is worth keeping and makes sure a re-run after a failure does not duplicate it.
 */
@Service
@Profile("postgres")
public class BulletinIngestService {

    private static final Logger log = LoggerFactory.getLogger(BulletinIngestService.class);

    /** The four daily bulletins. */
    static final List<String> BULLETIN_TYPES = List.of("mal", "yapim", "hizmet", "danismanlik");

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    /**
     * Announcements print their date as "23.09.2026 - 11:00", except where they print
     * "24.08.2026 10:00" or separate the time with a dot. The dash is normalised away and both
     * time separators are tried, because a bulletin is typeset by hand and disagreeing with itself
     * is normal.
     */
    private static final List<DateTimeFormatter> TENDER_AT = List.of(
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH.mm"));
    /** The archive names itself BULTEN_07082026_YAPIM.pdf — that is the bulletin's own date. */
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ofPattern("ddMMyyyy");
    /** Results print their contract and tender dates without a time. */
    private static final DateTimeFormatter RESULT_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    /**
     * The line a result carries when its tender was divided into lots: "Sözleşmeye Esas
     * Kısımlarının Yaklaşık Maliyeti". Its presence is what stops one lot's price being reported
     * as a 98% discount off the whole tender's estimate.
     */
    private static final String PARTIAL_AWARD_MARKER = "Sözleşmeye Esas";

    private final TenderNoticeRepository repository;
    private final TenderResultRepository resultRepository;
    private final TenderResultWatcher resultWatcher;
    private final TenderWatchService watchService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final boolean enabled;
    private final int retentionDays;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public BulletinIngestService(
            TenderNoticeRepository repository,
            TenderResultRepository resultRepository,
            TenderResultWatcher resultWatcher,
            TenderWatchService watchService,
            ObjectMapper objectMapper,
            @Value("${docsbot.rag.embedding-url:http://docsbot-embeddings:5001}") String baseUrl,
            @Value("${docsbot.bulletin.enabled:true}") boolean enabled,
            @Value("${docsbot.bulletin.retention-days:120}") int retentionDays
    ) {
        this(repository, resultRepository, resultWatcher, watchService, objectMapper, baseUrl,
                enabled, retentionDays, Clock.systemUTC());
    }

    BulletinIngestService(
            TenderNoticeRepository repository,
            TenderResultRepository resultRepository,
            TenderResultWatcher resultWatcher,
            TenderWatchService watchService,
            ObjectMapper objectMapper,
            String baseUrl,
            boolean enabled,
            int retentionDays,
            Clock clock
    ) {
        this.repository = repository;
        this.resultRepository = resultRepository;
        this.resultWatcher = resultWatcher;
        this.watchService = watchService;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.enabled = enabled;
        this.retentionDays = retentionDays;
        this.clock = clock;
        // HTTP/1.1 for the third time in this codebase: the sidecar is uvicorn, which answers
        // Java's HTTP/2 upgrade by serving the request with an empty body.
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /** Pinned above for a reason the type system cannot express; the test holds it in place. */
    HttpClient.Version protocolVersion() {
        return httpClient.version();
    }

    /** Pulls all four bulletins. Returns how many announcements were new. */
    public int ingestAll() {
        int stored = 0;
        for (String type : BULLETIN_TYPES) {
            try {
                stored += ingest(type);
            } catch (RuntimeException exception) {
                // One bulletin failing must not cost the other three: they are independent
                // documents and three quarters of the day's tenders is better than none.
                log.warn("bulletin_ingest_failed type={} reason={}", type, exception.getMessage());
            }
        }
        return stored;
    }

    /**
     * Reads one bulletin and stores what is new in it.
     *
     * <p>Deliberately not wrapped in a transaction of its own. Every caller reaches it from inside
     * this class, which never passes through the Spring proxy, so an annotation here would be read
     * as atomicity and deliver none — the trap that once left this project's nightly purge quietly
     * disabled. Row-at-a-time is also the behaviour worth having: three hundred announcements in
     * one transaction that fails on the last one loses all three hundred, while a run that stops
     * half way keeps what it read and skips it on the next pass.
     */
    public int ingest(String bulletinType) {
        if (!enabled) {
            return 0;
        }
        JsonNode payload = fetch(bulletinType);
        if (!payload.path("ok").asBoolean(false)) {
            // Distinguished from "no tenders today" on purpose: their page changing and the day
            // being quiet look identical in a count, and only one of them needs somebody's
            // attention.
            throw new IllegalStateException(
                    "bülten okunamadı: " + payload.path("error").asString("bilinmeyen hata"));
        }
        LocalDate bulletinDate = bulletinDateOf(payload.path("source").asString(""));
        Instant now = clock.instant();

        int stored = 0;
        int skipped = 0;
        for (JsonNode notice : payload.path("notices")) {
            String ikn = notice.path("ikn").asString("");
            String kind = notice.path("kind").asString("diger");
            if (ikn.isBlank()) {
                continue;
            }
            if (repository.existsByIknAndKindAndBulletinDateAndBulletinType(
                    ikn, kind, bulletinDate, bulletinType)) {
                skipped++;
                continue;
            }
            repository.save(new TenderNotice(
                    ikn,
                    bulletinType,
                    bulletinDate,
                    kind,
                    trim(notice.path("section").asString(""), 160),
                    trim(notice.path("authority").asString(""), 400),
                    notice.path("address").asString(""),
                    trim(emptyToNull(notice.path("province").asString("")), 40),
                    trim(notice.path("tender_at").asString(""), 64),
                    parseTenderAt(notice.path("tender_at").asString("")),
                    notice.path("title").asString(""),
                    notice.path("quantity").asString(""),
                    notice.path("delivery_place").asString(""),
                    notice.path("text").asString(""),
                    now));
            stored++;
        }
        log.info("bulletin_ingested type={} date={} new={} already_had={}",
                bulletinType, bulletinDate, stored, skipped);
        storeResults(payload, bulletinType, bulletinDate, now);
        return stored;
    }

    /**
     * Stores the day's awarded contracts, which ride along in the same payload.
     *
     * <p>Counted separately from the announcements and never allowed to fail the pull: the
     * announcements are what somebody is waiting on at nine in the morning, and a layout change in
     * the results bulletin must not cost them.
     */
    private void storeResults(JsonNode payload, String bulletinType, LocalDate bulletinDate, Instant now) {
        int stored = 0;
        int partial = 0;
        int announced = 0;
        for (JsonNode result : payload.path("results")) {
            String ikn = result.path("ikn").asString("");
            if (ikn.isBlank()) {
                continue;
            }
            try {
                java.math.BigDecimal amount = decimal(result.path("contract_amount").asString(""));
                String winner = result.path("winner").asString("");
                String awardKey = TenderResult.awardKey(winner, amount);
                if (resultRepository.existsByIknAndBulletinDateAndBulletinTypeAndAwardKey(
                        ikn, bulletinDate, bulletinType, awardKey)) {
                    continue;
                }
                // A tender says it was split into lots in two ways, and both have to be believed.
                // The announcement itself carries a "Sözleşmeye Esas Kısımlarının" line; and a
                // second contract turning up under the same İKN — today's bulletin or one from
                // last month — proves it whatever the announcement said.
                List<TenderResult> siblings = resultRepository.findByIkn(ikn);
                boolean lots = result.path("text").asString("").contains(PARTIAL_AWARD_MARKER)
                        || !siblings.isEmpty();
                TenderResult record = new TenderResult(
                        ikn,
                        bulletinType,
                        bulletinDate,
                        trim(result.path("authority").asString(""), 400),
                        result.path("title").asString(""),
                        trim(emptyToNull(result.path("province").asString("")), 40),
                        result.path("work_place").asString(""),
                        trim(result.path("procedure").asString(""), 160),
                        date(result.path("tender_date").asString("")),
                        date(result.path("contract_date").asString("")),
                        decimal(result.path("estimated_cost").asString("")),
                        trim(emptyToNull(result.path("estimated_currency").asString("")), 3),
                        amount,
                        trim(emptyToNull(result.path("contract_currency").asString("")), 3),
                        integer(result.path("bid_count").asString("")),
                        integer(result.path("valid_bid_count").asString("")),
                        winner,
                        result.path("winner_address").asString(""),
                        trim(emptyToNull(result.path("winner_province").asString("")), 40),
                        lots,
                        result.path("text").asString(""),
                        now);
                TenderResult saved = resultRepository.save(record);
                stored++;
                if (lots && !siblings.isEmpty()) {
                    // The row stored last week looked whole because it was alone. It is not.
                    resultRepository.markPartialByIkn(ikn);
                    partial++;
                }
                // After the partial correction, so a lot award is never announced with a discount
                // the next line is about to withdraw.
                announced += resultWatcher.announce(saved);
            } catch (RuntimeException exception) {
                // One malformed result must not cost the rest of the bulletin.
                log.warn("bulletin_result_skipped type={} ikn={} reason={}",
                        bulletinType, ikn, exception.getMessage());
            }
        }
        if (stored > 0) {
            log.info("bulletin_results_ingested type={} date={} new={} lots_corrected={} announced={}",
                    bulletinType, bulletinDate, stored, partial, announced);
        }
    }

    /**
     * Runs once each weekday morning, after the bulletin is published and early enough that
     * somebody can act on what it found the same day.
     */
    @Scheduled(cron = "${docsbot.bulletin.cron:0 30 9 * * MON-FRI}", zone = "Europe/Istanbul")
    public void ingestScheduled() {
        try {
            int stored = ingestAll();
            log.info("bulletin_scan_complete new={}", stored);
        } catch (RuntimeException exception) {
            log.warn("bulletin_scan_failed", exception);
        }
        try {
            // Announced even when the pull failed: three quarters of the bulletins may have landed,
            // and what did land is still worth telling somebody about.
            watchService.announceToday();
        } catch (RuntimeException exception) {
            log.warn("bulletin_announce_failed", exception);
        }
        try {
            purgeOld();
        } catch (RuntimeException exception) {
            // Separately, so a failed pull still prunes and a failed prune still leaves the pull.
            log.warn("bulletin_purge_failed", exception);
        }
    }

    /**
     * Drops bulletins older than the retention window.
     *
     * <p>Three hundred announcements a day arrive with their full printed text, so left alone this
     * table is the one that quietly fills the disk. Nothing is lost that cannot be fetched again:
     * it is a public bulletin, still on EKAP's own site. A window of zero or less keeps everything.
     *
     * <p>The transaction the delete needs is declared on the repository method, not here, for the
     * same reason as above: this is called from a scheduled method on this very class.
     */
    public int purgeOld() {
        if (retentionDays <= 0) {
            return 0;
        }
        LocalDate cutoff = LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE).minusDays(retentionDays);
        int deleted = repository.deleteOlderThan(cutoff);
        int deletedResults = resultRepository.deleteOlderThan(cutoff);
        if (deleted > 0 || deletedResults > 0) {
            log.info("bulletin_purged deleted={} results={} older_than={}",
                    deleted, deletedResults, cutoff);
        }
        return deleted;
    }

    private JsonNode fetch(String bulletinType) {
        try {
            HttpResponse<String> response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(baseUrl + "/bulletin/" + bulletinType))
                            // Generous: the sidecar downloads several megabytes and reads a
                            // two-hundred-page PDF before it answers.
                            .timeout(Duration.ofMinutes(15))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("bülten servisi HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("bülten isteği kesildi", exception);
        } catch (IllegalStateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("bülten isteği başarısız: " + exception.getMessage(), exception);
        }
    }

    /**
     * The bulletin's own date, read from the archive's filename. Taken from there rather than from
     * today's date because the bulletin published on a Monday covers the previous working day, and
     * storing it under the wrong date would make a re-run look like a new bulletin.
     */
    private LocalDate bulletinDateOf(String source) {
        java.util.regex.Matcher matcher =
                java.util.regex.Pattern.compile("(\\d{8})").matcher(source);
        if (matcher.find()) {
            try {
                return LocalDate.parse(matcher.group(1), FILE_DATE);
            } catch (RuntimeException ignored) {
                // Falls through to today, below.
            }
        }
        return LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE);
    }

    private static Instant parseTenderAt(String printed) {
        if (printed == null || printed.isBlank()) {
            return null;
        }
        String normalised = printed.trim().replace(" - ", " ");
        for (DateTimeFormatter format : TENDER_AT) {
            try {
                return LocalDateTime.parse(normalised, format).atZone(BUSINESS_ZONE).toInstant();
            } catch (RuntimeException ignored) {
                // Try the next shape.
            }
        }
        // Some announcements print something else entirely. The text is kept either way, so a date
        // that cannot be parsed costs sorting, not the record.
        return null;
    }

    /** A printed "07.08.2026", or null — a date the bulletin left out costs sorting, not the row. */
    private static LocalDate date(String printed) {
        if (printed == null || printed.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(printed.trim(), RESULT_DATE);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    /**
     * A contract sum, already normalised to "54524045.00" by the parser.
     *
     * <p>Kept out of {@code double} the whole way: these are the numbers a company prices its own
     * bid against, and a sum that comes back a lira short is worse than one that never arrived.
     */
    private static java.math.BigDecimal decimal(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return new java.math.BigDecimal(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Integer integer(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
