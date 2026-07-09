package com.docsbot.ops.erp.domain;

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
        name = "erp_direct_message_hidden_receipts",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_erp_direct_message_hidden_actor",
                columnNames = {"message_id", "actor_key"}))
public class ErpDirectMessageHiddenReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "actor_key", nullable = false, length = 64)
    private String actorKey;

    @Column(name = "hidden_at", nullable = false)
    private Instant hiddenAt;

    protected ErpDirectMessageHiddenReceipt() {
    }

    public static ErpDirectMessageHiddenReceipt create(long messageId, String actorKey, Instant hiddenAt) {
        ErpDirectMessageHiddenReceipt receipt = new ErpDirectMessageHiddenReceipt();
        receipt.messageId = messageId;
        receipt.actorKey = actorKey;
        receipt.hiddenAt = hiddenAt;
        return receipt;
    }
}
