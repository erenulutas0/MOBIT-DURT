package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_groups")
public class DocumentGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "tender_id", length = 128)
    private String tenderId;

    @Column(name = "year")
    private Integer year;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DocumentGroup() {
    }

    public static DocumentGroup create(
            String name,
            String description,
            String tenderId,
            Integer year,
            String createdBy,
            Instant now
    ) {
        DocumentGroup group = new DocumentGroup();
        group.name = name;
        group.description = blankToNull(description);
        group.tenderId = blankToNull(tenderId);
        group.year = year;
        group.createdBy = createdBy;
        group.createdAt = now;
        group.updatedAt = now;
        return group;
    }

    public void update(String name, String description, String tenderId, Integer year, Instant now) {
        this.name = name;
        this.description = blankToNull(description);
        this.tenderId = blankToNull(tenderId);
        this.year = year;
        this.updatedAt = now;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }

    public void setArchived(boolean archived, Instant now) {
        this.archivedAt = archived ? now : null;
        this.updatedAt = now;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getTenderId() { return tenderId; }
    public Integer getYear() { return year; }
    public String getCreatedBy() { return createdBy; }
    public Instant getArchivedAt() { return archivedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
