package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.CompanyCredential;
import com.docsbot.ops.erp.infrastructure.CompanyCredentialRepository;

/**
 * Keeps the company's own paperwork from lapsing unnoticed.
 *
 * <p>Imza sirküleri, oda kayıt belgesi, borcu yoktur yazıları: every idare asks for them, they all
 * expire, and nobody notices until the day a bid is being assembled. That is the failure this
 * exists to prevent, so the reminder — not the list — is the feature.
 */
@Service
@Profile("postgres")
public class CompanyCredentialService {

    private static final Logger log = LoggerFactory.getLogger(CompanyCredentialService.class);

    public static final String EXPIRY_TYPE = "credential_expiring";

    /**
     * How far ahead to warn, in days. Spaced rather than daily: a renewal takes a couple of weeks
     * to arrange, and an alert every morning for a month is one people learn to swipe away — which
     * is exactly how the last one gets missed too.
     */
    private static final List<Integer> WARN_DAYS = List.of(30, 14, 7, 1, 0);

    /**
     * Expiry dates are Turkish business dates: a document valid "until 15 August" lapses at the end
     * of that day in Istanbul, not wherever the server happens to think it is. Fixing the zone here
     * keeps the count of days remaining from being off by one for half of every day.
     */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    private final CompanyCredentialRepository repository;
    private final NotificationService notificationService;
    private final Clock clock;

    /** Marked because the test constructor below makes the choice ambiguous otherwise. */
    @org.springframework.beans.factory.annotation.Autowired
    public CompanyCredentialService(
            CompanyCredentialRepository repository,
            NotificationService notificationService
    ) {
        this(repository, notificationService, Clock.systemUTC());
    }

    CompanyCredentialService(
            CompanyCredentialRepository repository,
            NotificationService notificationService,
            Clock clock
    ) {
        this.repository = repository;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CompanyCredential> all() {
        return repository.findAllByUrgency();
    }

    @Transactional
    public CompanyCredential create(String name, String kind, LocalDate issuedAt, LocalDate validUntil,
                                    Long documentId, String note) {
        String cleaned = name == null ? "" : name.trim();
        if (cleaned.isEmpty()) {
            throw new ErpExceptions.BadRequest("Belge adı zorunludur.");
        }
        return repository.save(new CompanyCredential(
                cleaned, blankToNull(kind), issuedAt, validUntil, documentId, blankToNull(note),
                clock.instant()));
    }

    @Transactional
    public CompanyCredential update(long id, String name, String kind, LocalDate issuedAt,
                                    LocalDate validUntil, Long documentId, String note) {
        CompanyCredential credential = repository.findById(id)
                .orElseThrow(() -> new ErpExceptions.NotFound("Belge bulunamadı."));
        String cleaned = name == null ? "" : name.trim();
        if (cleaned.isEmpty()) {
            throw new ErpExceptions.BadRequest("Belge adı zorunludur.");
        }
        credential.update(cleaned, blankToNull(kind), issuedAt, validUntil, documentId,
                blankToNull(note), clock.instant());
        return repository.save(credential);
    }

    @Transactional
    public void delete(long id) {
        repository.deleteById(id);
    }

    /**
     * Warns about anything lapsing within the widest threshold.
     *
     * <p>The event key carries the document, the expiry date and the threshold, which makes the
     * notification layer's dedup do three jobs at once: one alert per step rather than one per
     * scan, a fresh set of alerts when the document is renewed to a new date, and nothing at all
     * re-sent if the scan runs twice.
     */
    @Transactional
    public int notifyExpiring() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE);
        Instant now = clock.instant();
        int sent = 0;
        for (CompanyCredential credential : repository
                .findByValidUntilNotNullAndValidUntilLessThanEqual(today.plusDays(WARN_DAYS.get(0)))) {
            Long remaining = credential.daysRemaining(today);
            if (remaining == null) {
                continue;
            }
            // The step this document has reached: the tightest threshold it has passed. Expired
            // documents fall to the 0 bucket and are chased once, not every morning forever.
            Integer step = WARN_DAYS.stream()
                    .filter(days -> remaining <= days)
                    .reduce((first, second) -> second)
                    .orElse(null);
            if (step == null) {
                continue;
            }
            sent += notificationService.notifyAdmin(
                    EXPIRY_TYPE,
                    remaining < 0
                            ? credential.getName() + " süresi doldu"
                            : credential.getName() + " süresi doluyor",
                    describe(credential, remaining),
                    null,
                    remaining <= 7 ? "high" : "normal",
                    "credential:" + credential.getId() + ":" + credential.getValidUntil() + ":" + step,
                    now);
        }
        if (sent > 0) {
            log.info("credential_expiry_alerts sent={}", sent);
        }
        return sent;
    }

    /** Runs mid-morning, when somebody can act on it the same day. */
    @Scheduled(cron = "${docsbot.credentials.scan-cron:0 15 10 * * *}", zone = "Europe/Istanbul")
    public void notifyExpiringScheduled() {
        try {
            notifyExpiring();
        } catch (RuntimeException exception) {
            // One bad row must not kill the scheduler for the rest of the process's life.
            log.warn("credential_expiry_scan_failed", exception);
        }
    }

    private static String describe(CompanyCredential credential, long remaining) {
        if (remaining < 0) {
            return credential.getValidUntil() + " tarihinde doldu. Yenilenmeden teklif verilemez.";
        }
        if (remaining == 0) {
            return "Bugün son geçerlilik günü (" + credential.getValidUntil() + ").";
        }
        return remaining + " gün sonra doluyor (" + credential.getValidUntil() + ").";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
