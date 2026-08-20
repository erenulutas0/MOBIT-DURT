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
 * What this company offered for one tender.
 *
 * <p>The one figure no competing service can hold. Every tender platform in the country reads the
 * same public bulletin and can say what a job went for; none of them knows what <em>this</em>
 * company bid, because that number never leaves the company. Kept beside the published result it
 * stops being a statistic and becomes a lesson: three percent over, for the third time, against the
 * same firm.
 *
 * <p>The tender's details are copied in rather than referenced. Announcements are a cached copy of
 * a public document and get purged; what a company offered is its own record and outlives the
 * bulletin that prompted it.
 */
@Entity
@Table(name = "erp_tender_bids")
public class TenderBid {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String ikn;

    @Column(name = "notice_id")
    private Long noticeId;

    @Column(columnDefinition = "text")
    private String title;

    @Column(length = 400)
    private String authority;

    @Column(length = 40)
    private String province;

    @Column(length = 40)
    private String category;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency = "TRY";

    @Column(name = "bid_at", nullable = false)
    private LocalDate bidAt;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "outcome_override", length = 16)
    private String outcomeOverride;

    @Column(name = "recorded_by", length = 160)
    private String recordedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt;

    protected TenderBid() {
    }

    public TenderBid(String ikn, Long noticeId, String title, String authority, String province,
                     String category, BigDecimal amount, String currency, LocalDate bidAt,
                     String note, String recordedBy, Instant now) {
        this.ikn = ikn;
        this.noticeId = noticeId;
        this.title = title;
        this.authority = authority;
        this.province = province;
        this.category = category;
        this.amount = amount;
        this.currency = currency == null || currency.isBlank() ? "TRY" : currency;
        this.bidAt = bidAt;
        this.note = note;
        this.recordedBy = recordedBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(BigDecimal amount, LocalDate bidAt, String note, String outcomeOverride,
                       String recordedBy, Instant now) {
        this.amount = amount;
        this.bidAt = bidAt;
        this.note = note;
        this.outcomeOverride = outcomeOverride;
        this.recordedBy = recordedBy;
        this.updatedAt = now;
    }

    public Long getId() { return id; }
    public String getIkn() { return ikn; }
    public Long getNoticeId() { return noticeId; }
    public String getTitle() { return title; }
    public String getAuthority() { return authority; }
    public String getProvince() { return province; }
    public String getCategory() { return category; }
    public BigDecimal getAmount() { return amount; }
    public String getCurrency() { return currency; }
    public LocalDate getBidAt() { return bidAt; }
    public String getNote() { return note; }
    public String getOutcomeOverride() { return outcomeOverride; }
    public String getRecordedBy() { return recordedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
