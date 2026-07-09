package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "document_group_message_read_receipts",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_document_group_message_read_actor",
                columnNames = {"message_id", "actor_key"}))
public class DocumentGroupMessageReadReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "actor_key", nullable = false, length = 64)
    private String actorKey;

    @Column(name = "read_at", nullable = false)
    private Instant readAt;

    protected DocumentGroupMessageReadReceipt() {
    }

    public static DocumentGroupMessageReadReceipt create(long messageId, String actorKey, Instant readAt) {
        DocumentGroupMessageReadReceipt receipt = new DocumentGroupMessageReadReceipt();
        receipt.messageId = messageId;
        receipt.actorKey = actorKey;
        receipt.readAt = readAt;
        return receipt;
    }

    public Long getId() { return id; }
    public Long getMessageId() { return messageId; }
    public String getActorKey() { return actorKey; }
    public Instant getReadAt() { return readAt; }
}
