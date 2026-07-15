package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Admin-published announcement shown to every user as a dismissible overlay after login. Publishing
 * creates a new row and deactivates the previous one, so history is preserved and the client can
 * key its "already dismissed" state on the row id + updated_at.
 */
@Entity
@Table(name = "erp_announcements")
public class ErpAnnouncement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String body;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ErpAnnouncement() {
    }

    public static ErpAnnouncement publish(String title, String body, String createdBy, Instant now) {
        ErpAnnouncement announcement = new ErpAnnouncement();
        announcement.title = title;
        announcement.body = body;
        announcement.active = true;
        announcement.createdBy = createdBy;
        announcement.createdAt = now;
        announcement.updatedAt = now;
        return announcement;
    }

    public void deactivate(Instant now) {
        active = false;
        updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public boolean isActive() {
        return active;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
