package com.docsbot.ops.bulletin.domain;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One announcement from the Kamu İhale Bülteni.
 *
 * <p>The parsed fields say what a tender is — who is buying, where, and when it closes. The body
 * says whether it is one this company can do: "3x240/25 mm² XLPE kablo" is in there and nowhere
 * else, and matching on titles alone would put an electrical contractor in front of every tender
 * with the word "kablo" in its name.
 */
@Entity
@Table(name = "erp_tender_notices")
public class TenderNotice {

    /** What the bulletin's own section heading said this announcement was. */
    public static final String KIND_TENDER = "ilan";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String ikn;

    @Column(name = "bulletin_type", nullable = false, length = 20)
    private String bulletinType;

    @Column(name = "bulletin_date", nullable = false)
    private LocalDate bulletinDate;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(length = 160)
    private String section;

    @Column(length = 400)
    private String authority;

    @Column(columnDefinition = "text")
    private String address;

    @Column(length = 40)
    private String province;

    @Column(name = "tender_at_text", length = 64)
    private String tenderAtText;

    @Column(name = "tender_at")
    private Instant tenderAt;

    /** {@link TenderCategory#code()} — what the work is, not how it is procured. */
    @Column(length = 40)
    private String category;

    /**
     * The preparation task somebody opened for this tender, once one exists.
     *
     * <p>Not a foreign key: the notice is a copy of a public document and gets purged after the
     * retention window, while what the company decided to do about a tender is its own record and
     * has to outlive it.
     */
    @Column(name = "task_id")
    private Long taskId;

    @Column(columnDefinition = "text")
    private String title;

    @Column(columnDefinition = "text")
    private String quantity;

    @Column(name = "delivery_place", columnDefinition = "text")
    private String deliveryPlace;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected TenderNotice() {
    }

    public TenderNotice(String ikn, String bulletinType, LocalDate bulletinDate, String kind,
                        String section, String authority, String address, String province,
                        String tenderAtText, Instant tenderAt, String title, String quantity,
                        String deliveryPlace, String body, Instant now) {
        this.ikn = ikn;
        this.bulletinType = bulletinType;
        this.bulletinDate = bulletinDate;
        this.kind = kind;
        this.section = section;
        this.authority = authority;
        this.address = address;
        this.province = province;
        this.tenderAtText = tenderAtText;
        this.tenderAt = tenderAt;
        this.title = title;
        this.quantity = quantity;
        this.deliveryPlace = deliveryPlace;
        this.body = body;
        this.createdAt = now;
        // Classified here rather than by the caller: every announcement gets a category, and a
        // constructor that could be called without one guarantees rows that were never classified.
        this.category = TenderCategory.classify(title, body).code();
    }

    /** True for announcements a company could still bid on, as opposed to cancellations. */
    public boolean isLiveTender() {
        return KIND_TENDER.equals(kind);
    }

    public Long getId() { return id; }
    public String getIkn() { return ikn; }
    public String getBulletinType() { return bulletinType; }
    public LocalDate getBulletinDate() { return bulletinDate; }
    public String getKind() { return kind; }
    public String getSection() { return section; }
    public String getAuthority() { return authority; }
    public String getAddress() { return address; }
    public String getProvince() { return province; }
    public String getTenderAtText() { return tenderAtText; }
    public Instant getTenderAt() { return tenderAt; }
    public String getCategory() { return category; }
    public String getCategoryLabel() { return TenderCategory.fromCode(category).label(); }
    public Long getTaskId() { return taskId; }

    /** Records the preparation task. Refuses to overwrite one, so a second click cannot orphan it. */
    public void attachTask(long newTaskId) {
        if (this.taskId != null) {
            throw new IllegalStateException("Bu ilan için zaten görev açılmış: #" + this.taskId);
        }
        this.taskId = newTaskId;
    }
    public String getTitle() { return title; }
    public String getQuantity() { return quantity; }
    public String getDeliveryPlace() { return deliveryPlace; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
}
