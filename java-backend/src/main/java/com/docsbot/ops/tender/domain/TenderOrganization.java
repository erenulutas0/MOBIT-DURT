package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "tender_organizations")
public class TenderOrganization {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(nullable = false)
    private Integer active;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TenderOrganization() {
    }

    public static TenderOrganization active(String code, String name) {
        TenderOrganization organization = new TenderOrganization();
        organization.code = code;
        organization.name = name;
        organization.active = 1;
        organization.createdAt = Instant.now();
        return organization;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public Integer getActive() { return active; }
    public Instant getCreatedAt() { return createdAt; }
}
