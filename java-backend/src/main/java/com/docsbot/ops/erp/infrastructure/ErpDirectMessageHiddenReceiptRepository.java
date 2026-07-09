package com.docsbot.ops.erp.infrastructure;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpDirectMessageHiddenReceipt;

public interface ErpDirectMessageHiddenReceiptRepository
        extends JpaRepository<ErpDirectMessageHiddenReceipt, Long> {

    boolean existsByMessageIdAndActorKey(long messageId, String actorKey);
}
