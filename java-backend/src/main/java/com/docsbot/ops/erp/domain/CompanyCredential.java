package com.docsbot.ops.erp.domain;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A piece of the company's own paperwork that expires and is asked for again at every tender.
 *
 * <p>Imza sirküleri, oda kayıt belgesi, SGK borcu yoktur yazısı. Discovering that one lapsed last
 * week is not a filing problem, it is a bid that cannot be submitted — so the date is the point of
 * the record and the reminder is the point of the feature.
 */
@Entity
@Table(name = "erp_company_credentials")
public class CompanyCredential {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 80)
    private String kind;

    @Column(name = "issued_at")
    private LocalDate issuedAt;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(name = "document_id")
    private Long documentId;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected CompanyCredential() {
    }

    public CompanyCredential(String name, String kind, LocalDate issuedAt, LocalDate validUntil,
                             Long documentId, String note, Instant now) {
        this.name = name;
        this.kind = kind;
        this.issuedAt = issuedAt;
        this.validUntil = validUntil;
        this.documentId = documentId;
        this.note = note;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String name, String kind, LocalDate issuedAt, LocalDate validUntil,
                       Long documentId, String note, Instant now) {
        this.name = name;
        this.kind = kind;
        this.issuedAt = issuedAt;
        this.validUntil = validUntil;
        this.documentId = documentId;
        this.note = note;
        this.updatedAt = now;
    }

    /**
     * Days until it lapses; negative once it has. Null when the document has no expiry at all,
     * which is not the same as "expires today" and must not be reported as urgent.
     */
    public Long daysRemaining(LocalDate today) {
        return validUntil == null ? null : java.time.temporal.ChronoUnit.DAYS.between(today, validUntil);
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getKind() { return kind; }
    public LocalDate getIssuedAt() { return issuedAt; }
    public LocalDate getValidUntil() { return validUntil; }
    public Long getDocumentId() { return documentId; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
