package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_group_members")
public class DocumentGroupMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 32)
    private String role;

    @Column(name = "added_by", nullable = false)
    private String addedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentGroupMember() {
    }

    public static DocumentGroupMember create(long groupId, long userId, String role, String addedBy, Instant now) {
        DocumentGroupMember member = new DocumentGroupMember();
        member.groupId = groupId;
        member.userId = userId;
        member.role = role;
        member.addedBy = addedBy;
        member.createdAt = now;
        return member;
    }

    public void updateRole(String role) {
        this.role = role;
    }

    public Long getId() { return id; }
    public Long getGroupId() { return groupId; }
    public Long getUserId() { return userId; }
    public String getRole() { return role; }
    public String getAddedBy() { return addedBy; }
    public Instant getCreatedAt() { return createdAt; }
}
