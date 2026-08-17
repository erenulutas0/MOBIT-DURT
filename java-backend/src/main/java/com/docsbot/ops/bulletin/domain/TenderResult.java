package com.docsbot.ops.bulletin.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One awarded contract from the İhale Sonuç İlanları bulletin.
 *
 * <p>The announcements say what is being bought; these say what it went for. Together they answer
 * the question a company actually has before deciding what to bid — the idare's own estimate beside
 * the sum somebody else won the work for — and that is a number nobody publishes in one place.
 *
 * <p>A row is one contract, not one tender. A tender divided into kısım produces one row per lot,
 * all sharing an İKN and all carrying the whole tender's estimate, so the discount is only ever
 * computed for awards known to be whole. See {@link #discountPercent()}.
 */
@Entity
@Table(name = "erp_tender_results")
public class TenderResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String ikn;

    @Column(name = "bulletin_type", nullable = false, length = 20)
    private String bulletinType;

    @Column(name = "bulletin_date", nullable = false)
    private LocalDate bulletinDate;

    @Column(length = 400)
    private String authority;

    @Column(columnDefinition = "text")
    private String title;

    @Column(length = 40)
    private String province;

    @Column(name = "work_place", columnDefinition = "text")
    private String workPlace;

    @Column(name = "procedure_name", length = 160)
    private String procedureName;

    @Column(name = "tender_date")
    private LocalDate tenderDate;

    @Column(name = "contract_date")
    private LocalDate contractDate;

    @Column(name = "estimated_cost", precision = 18, scale = 2)
    private BigDecimal estimatedCost;

    @Column(name = "estimated_currency", length = 3)
    private String estimatedCurrency;

    @Column(name = "contract_amount", precision = 18, scale = 2)
    private BigDecimal contractAmount;

    @Column(name = "contract_currency", length = 3)
    private String contractCurrency;

    @Column(name = "bid_count")
    private Integer bidCount;

    @Column(name = "valid_bid_count")
    private Integer validBidCount;

    @Column(columnDefinition = "text")
    private String winner;

    @Column(name = "winner_address", columnDefinition = "text")
    private String winnerAddress;

    @Column(name = "winner_province", length = 40)
    private String winnerProvince;

    @Column(length = 40)
    private String category;

    @Column(name = "partial_award", nullable = false)
    private boolean partialAward;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "award_key", nullable = false, length = 40)
    private String awardKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected TenderResult() {
    }

    public TenderResult(String ikn, String bulletinType, LocalDate bulletinDate, String authority,
                        String title, String province, String workPlace, String procedureName,
                        LocalDate tenderDate, LocalDate contractDate,
                        BigDecimal estimatedCost, String estimatedCurrency,
                        BigDecimal contractAmount, String contractCurrency,
                        Integer bidCount, Integer validBidCount,
                        String winner, String winnerAddress, String winnerProvince,
                        boolean partialAward, String body, Instant now) {
        this.ikn = ikn;
        this.bulletinType = bulletinType;
        this.bulletinDate = bulletinDate;
        this.authority = authority;
        this.title = title;
        this.province = province;
        this.workPlace = workPlace;
        this.procedureName = procedureName;
        this.tenderDate = tenderDate;
        this.contractDate = contractDate;
        this.estimatedCost = estimatedCost;
        this.estimatedCurrency = estimatedCurrency;
        this.contractAmount = contractAmount;
        this.contractCurrency = contractCurrency;
        this.bidCount = bidCount;
        this.validBidCount = validBidCount;
        this.winner = winner;
        this.winnerAddress = winnerAddress;
        this.winnerProvince = winnerProvince;
        this.partialAward = partialAward;
        this.body = body;
        this.createdAt = now;
        // Classified here for the same reason the announcements are: every row gets a category, and
        // a constructor that could be called without one guarantees rows nobody ever classified.
        this.category = TenderCategory.classify(title, body).code();
        this.awardKey = awardKey(winner, contractAmount);
    }

    /**
     * What separates two contracts awarded under the same İKN in the same bulletin.
     *
     * <p>Hashed rather than stored whole because a Turkish joint venture's name — three companies
     * and their full legal suffixes — runs past anything that belongs in a unique index.
     */
    public static String awardKey(String winner, BigDecimal amount) {
        String source = (winner == null ? "" : winner.trim())
                + "|" + (amount == null ? "" : amount.toPlainString());
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 16);
        } catch (NoSuchAlgorithmException exception) {
            // SHA-256 is required of every JVM; if it is genuinely missing, nothing else here works.
            throw new IllegalStateException(exception);
        }
    }

    /**
     * Above this, the figure is not a discount — it is a lot award nobody flagged.
     *
     * <p>Two independent reasons for the line, and they agree. In law, a bid at a tenth of the
     * estimate triggers aşırı düşük teklif sorgulaması and is all but certain to be rejected, so a
     * whole tender let 90% under simply does not happen. In the data, the genuine distribution has
     * run out well before here: of 1,346 awards believed whole, the 98th percentile sits at 69.5%,
     * exactly one lands between 75 and 90 — and twenty-two sit above 90, all of them tenders like
     * "58 Kalem Muhtelif Motor Malzemeleri" where a 78-million estimate meets a 450-lira contract.
     * The line is drawn through the empty band between two populations, not through the tail of
     * one, which is why it costs no real discount.
     */
    private static final BigDecimal IMPLAUSIBLE_DISCOUNT = BigDecimal.valueOf(90);

    /** Why a discount is or is not being published. */
    public enum DiscountStatus {
        COMPUTED,
        /** The tender was awarded in lots, so the estimate and the amount describe different things. */
        LOT_AWARD,
        /** Believed whole, but priced like a single lot — see {@link #IMPLAUSIBLE_DISCOUNT}. */
        SUSPECTED_LOT_AWARD,
        /** A figure is missing, or the two are in different currencies. */
        UNAVAILABLE,
    }

    public DiscountStatus discountStatus() {
        if (partialAward) {
            return DiscountStatus.LOT_AWARD;
        }
        if (estimatedCost == null || contractAmount == null || estimatedCost.signum() <= 0) {
            return DiscountStatus.UNAVAILABLE;
        }
        if (estimatedCurrency != null && contractCurrency != null
                && !estimatedCurrency.equals(contractCurrency)) {
            // A lira contract against a euro estimate is not a ratio.
            return DiscountStatus.UNAVAILABLE;
        }
        return rawDiscount().compareTo(IMPLAUSIBLE_DISCOUNT) > 0
                ? DiscountStatus.SUSPECTED_LOT_AWARD
                : DiscountStatus.COMPUTED;
    }

    /**
     * How far under the idare's estimate the work was let, as a percentage — or null when saying
     * would be a lie.
     *
     * <p>Withheld for a lot award, because the estimate covers the whole tender while the amount
     * covers one lot: an eleven-item drug tender whose first lot went for 25 thousand against a
     * 1.6 million estimate is not a 98% discount, and publishing it as one would teach people to
     * ignore the number on the days it matters.
     */
    public BigDecimal discountPercent() {
        return discountStatus() == DiscountStatus.COMPUTED ? rawDiscount() : null;
    }

    private BigDecimal rawDiscount() {
        return BigDecimal.ONE
                .subtract(contractAmount.divide(estimatedCost, 6, RoundingMode.HALF_UP))
                .multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP);
    }

    /** Marks the tender as awarded in lots, once a second contract turns up under the same İKN. */
    public void markPartial() {
        this.partialAward = true;
    }

    public Long getId() { return id; }
    public String getIkn() { return ikn; }
    public String getBulletinType() { return bulletinType; }
    public LocalDate getBulletinDate() { return bulletinDate; }
    public String getAuthority() { return authority; }
    public String getTitle() { return title; }
    public String getProvince() { return province; }
    public String getWorkPlace() { return workPlace; }
    public String getProcedureName() { return procedureName; }
    public LocalDate getTenderDate() { return tenderDate; }
    public LocalDate getContractDate() { return contractDate; }
    public BigDecimal getEstimatedCost() { return estimatedCost; }
    public String getEstimatedCurrency() { return estimatedCurrency; }
    public BigDecimal getContractAmount() { return contractAmount; }
    public String getContractCurrency() { return contractCurrency; }
    public Integer getBidCount() { return bidCount; }
    public Integer getValidBidCount() { return validBidCount; }
    public String getWinner() { return winner; }
    public String getWinnerAddress() { return winnerAddress; }
    public String getWinnerProvince() { return winnerProvince; }
    public String getCategory() { return category; }
    public String getCategoryLabel() { return TenderCategory.fromCode(category).label(); }
    public boolean isPartialAward() { return partialAward; }
    public String getBody() { return body; }
    public String getAwardKey() { return awardKey; }
    public Instant getCreatedAt() { return createdAt; }
}
