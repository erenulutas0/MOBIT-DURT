package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_teams")
public class ErpTeam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    /**
     * Who may hand out work inside this team, when anybody may.
     *
     * <p>Null means nobody but an admin — the behaviour every team had before leads existed, so an
     * untouched team keeps working exactly as it did. Not a foreign key: deleting an employee must
     * not be blocked by a team that still names them, and a lead who has left reads as "no lead".
     */
    @Column(name = "lead_user_id")
    private Long leadUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpTeam() {
    }

    public static ErpTeam create(String name, Instant createdAt) {
        ErpTeam team = new ErpTeam();
        team.name = name;
        team.createdAt = createdAt;
        return team;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Long getLeadUserId() {
        return leadUserId;
    }

    public void assignLead(Long userId) {
        this.leadUserId = userId;
    }
}
