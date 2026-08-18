package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.CompanyQualification;
import com.docsbot.ops.bulletin.domain.QualificationCheck;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderQualification;
import com.docsbot.ops.bulletin.infrastructure.CompanyQualificationRepository;
import com.docsbot.ops.erp.domain.CompanyCredential;
import com.docsbot.ops.erp.infrastructure.CompanyCredentialRepository;

/**
 * "Can we bid on this?" — the announcement's bars beside what the company can prove.
 *
 * <p>The paperwork half comes from the credentials the company already tracks for their expiry
 * dates, because a bid submitted on a lapsed imza sirküleri is rejected at the door and that is the
 * cheapest disqualification there is.
 */
@Service
@Profile("postgres")
public class QualificationService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    /** The same window the home screen warns on, so the two screens never disagree. */
    private static final int EXPIRY_WARNING_DAYS = 30;

    private final CompanyQualificationRepository qualificationRepository;
    private final CompanyCredentialRepository credentialRepository;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public QualificationService(CompanyQualificationRepository qualificationRepository,
                                CompanyCredentialRepository credentialRepository) {
        this(qualificationRepository, credentialRepository, Clock.systemUTC());
    }

    QualificationService(CompanyQualificationRepository qualificationRepository,
                         CompanyCredentialRepository credentialRepository,
                         Clock clock) {
        this.qualificationRepository = qualificationRepository;
        this.credentialRepository = credentialRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CompanyQualification company() {
        return qualificationRepository.findFirstByOrderByIdAsc().orElse(null);
    }

    @Transactional
    public CompanyQualification save(BigDecimal experienceAmount, LocalDate experienceDate,
                                     String experienceSubject, BigDecimal turnoverLastYear,
                                     BigDecimal turnoverPreviousYear, BigDecimal sectorTurnover,
                                     BigDecimal currentRatio, BigDecimal equityRatio,
                                     BigDecimal bankDebtRatio, BigDecimal bankReferenceLimit,
                                     String updatedBy) {
        CompanyQualification qualification = qualificationRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new IllegalStateException("Yeterlik kaydı bulunamadı"));
        qualification.update(experienceAmount, experienceDate, experienceSubject, turnoverLastYear,
                turnoverPreviousYear, sectorTurnover, currentRatio, equityRatio, bankDebtRatio,
                bankReferenceLimit, updatedBy, clock.instant());
        return qualification;
    }

    /**
     * Checks one announcement against the company, for an intended bid.
     *
     * @param bid null when the user has not named an amount yet — every bar in the announcement is
     *            a ratio of it, so the answer is the ratios themselves rather than a verdict
     */
    @Transactional(readOnly = true)
    public QualificationCheck check(TenderNotice notice, BigDecimal bid) {
        TenderQualification tender = TenderQualification.parse(notice.getBody());
        LocalDate today = LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE);
        LocalDate tenderDate = notice.getTenderAt() == null
                ? today
                : LocalDate.ofInstant(notice.getTenderAt(), BUSINESS_ZONE);

        int lapsed = 0;
        int expiring = 0;
        for (CompanyCredential credential : credentialRepository.findAll()) {
            LocalDate validUntil = credential.getValidUntil();
            if (validUntil == null) {
                continue;
            }
            // Measured against the tender's own date, not today: a paper that expires next week is
            // fine for a tender that closes tomorrow and useless for one that closes next month.
            if (validUntil.isBefore(tenderDate)) {
                lapsed++;
            } else if (validUntil.isBefore(tenderDate.plusDays(EXPIRY_WARNING_DAYS))) {
                expiring++;
            }
        }
        return QualificationCheck.of(tender, company(), bid, tenderDate, lapsed, expiring);
    }
}
