package com.docsbot.ops.tender.infrastructure;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupMessageHiddenReceipt;

public interface DocumentGroupMessageHiddenReceiptRepository
        extends JpaRepository<DocumentGroupMessageHiddenReceipt, Long> {

    boolean existsByMessageIdAndActorKey(long messageId, String actorKey);
}
