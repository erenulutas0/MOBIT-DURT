package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "tenders")
public class Tender {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "tender_id", nullable = false)
    private String tenderId;
    @Column(nullable = false)
    private String organization;
    @Column(nullable = false)
    private Integer year;
    @Column(nullable = false)
    private Integer sequence;
    @Column(name = "internal_unit")
    private String internalUnit;
    private String title;
    @Column(nullable = false)
    private String status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Tender() {
    }

    public static Tender create(
            String tenderId,
            String organization,
            int year,
            int sequence,
            String internalUnit,
            String title,
            Instant createdAt
    ) {
        Tender tender = new Tender();
        tender.tenderId = tenderId;
        tender.organization = organization;
        tender.year = year;
        tender.sequence = sequence;
        tender.internalUnit = internalUnit;
        tender.title = title;
        tender.status = "active";
        tender.createdAt = createdAt;
        return tender;
    }

    public Long getId() { return id; }
    public String getTenderId() { return tenderId; }
    public String getOrganization() { return organization; }
    public Integer getYear() { return year; }
    public Integer getSequence() { return sequence; }
    public String getInternalUnit() { return internalUnit; }
    public String getTitle() { return title; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
