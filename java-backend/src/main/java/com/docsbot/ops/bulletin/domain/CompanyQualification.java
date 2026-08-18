package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * What the company can prove about itself when an idare asks.
 *
 * <p>Entered once instead of remembered by whoever is preparing the file. Every figure is nullable,
 * and a missing one means "not entered" rather than zero — the checklist has to be able to say "we
 * do not know" instead of "you do not qualify", because the second is a claim and a wrong one sends
 * a company away from a tender it could have won.
 */
@Entity
@Table(name = "erp_company_qualification")
public class CompanyQualification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "experience_amount", precision = 18, scale = 2)
    private BigDecimal experienceAmount;

    @Column(name = "experience_currency", length = 3)
    private String experienceCurrency = "TRY";

    @Column(name = "experience_date")
    private LocalDate experienceDate;

    @Column(name = "experience_subject", columnDefinition = "text")
    private String experienceSubject;

    @Column(name = "turnover_last_year", precision = 18, scale = 2)
    private BigDecimal turnoverLastYear;

    @Column(name = "turnover_previous_year", precision = 18, scale = 2)
    private BigDecimal turnoverPreviousYear;

    @Column(name = "sector_turnover", precision = 18, scale = 2)
    private BigDecimal sectorTurnover;

    @Column(name = "current_ratio", precision = 6, scale = 3)
    private BigDecimal currentRatio;

    @Column(name = "equity_ratio", precision = 6, scale = 3)
    private BigDecimal equityRatio;

    @Column(name = "bank_debt_ratio", precision = 6, scale = 3)
    private BigDecimal bankDebtRatio;

    @Column(name = "bank_reference_limit", precision = 18, scale = 2)
    private BigDecimal bankReferenceLimit;

    @Column(name = "updated_by", length = 160)
    private String updatedBy;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected CompanyQualification() {
    }

    /**
     * The turnover figure the law lets a bidder rely on.
     *
     * <p>The most recent closed year, or the average of the last two when that is kinder — which is
     * exactly the choice 4734 allows, and the one an accountant would make on the company's behalf.
     */
    public BigDecimal bestTurnover() {
        if (turnoverLastYear == null) {
            return turnoverPreviousYear;
        }
        if (turnoverPreviousYear == null) {
            return turnoverLastYear;
        }
        BigDecimal average = turnoverLastYear.add(turnoverPreviousYear)
                .divide(BigDecimal.valueOf(2), 2, java.math.RoundingMode.HALF_UP);
        return average.compareTo(turnoverLastYear) > 0 ? average : turnoverLastYear;
    }

    public void update(BigDecimal experienceAmount, LocalDate experienceDate, String experienceSubject,
                       BigDecimal turnoverLastYear, BigDecimal turnoverPreviousYear,
                       BigDecimal sectorTurnover, BigDecimal currentRatio, BigDecimal equityRatio,
                       BigDecimal bankDebtRatio, BigDecimal bankReferenceLimit,
                       String updatedBy, Instant now) {
        this.experienceAmount = experienceAmount;
        this.experienceDate = experienceDate;
        this.experienceSubject = experienceSubject;
        this.turnoverLastYear = turnoverLastYear;
        this.turnoverPreviousYear = turnoverPreviousYear;
        this.sectorTurnover = sectorTurnover;
        this.currentRatio = currentRatio;
        this.equityRatio = equityRatio;
        this.bankDebtRatio = bankDebtRatio;
        this.bankReferenceLimit = bankReferenceLimit;
        this.updatedBy = updatedBy;
        this.updatedAt = now;
    }

    public Long getId() { return id; }
    public BigDecimal getExperienceAmount() { return experienceAmount; }
    public String getExperienceCurrency() { return experienceCurrency; }
    public LocalDate getExperienceDate() { return experienceDate; }
    public String getExperienceSubject() { return experienceSubject; }
    public BigDecimal getTurnoverLastYear() { return turnoverLastYear; }
    public BigDecimal getTurnoverPreviousYear() { return turnoverPreviousYear; }
    public BigDecimal getSectorTurnover() { return sectorTurnover; }
    public BigDecimal getCurrentRatio() { return currentRatio; }
    public BigDecimal getEquityRatio() { return equityRatio; }
    public BigDecimal getBankDebtRatio() { return bankDebtRatio; }
    public BigDecimal getBankReferenceLimit() { return bankReferenceLimit; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
}
