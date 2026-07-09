package com.docsbot.ops.tender.infrastructure;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupMessageReadReceipt;

public interface DocumentGroupMessageReadReceiptRepository
        extends JpaRepository<DocumentGroupMessageReadReceipt, Long> {
    boolean existsByMessageIdAndActorKey(long messageId, String actorKey);
}
