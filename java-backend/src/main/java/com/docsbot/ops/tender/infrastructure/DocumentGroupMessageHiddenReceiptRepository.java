package com.docsbot.ops.tender.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.tender.domain.DocumentGroupMessageHiddenReceipt;

public interface DocumentGroupMessageHiddenReceiptRepository
        extends JpaRepository<DocumentGroupMessageHiddenReceipt, Long> {

    boolean existsByMessageIdAndActorKey(long messageId, String actorKey);

    /** Batch lookup of which of the given messages this actor has hidden (avoids N+1). */
    @Query("""
            select receipt.messageId
            from DocumentGroupMessageHiddenReceipt receipt
            where receipt.actorKey = :actorKey
              and receipt.messageId in :messageIds
            """)
    List<Long> findHiddenMessageIds(
            @Param("actorKey") String actorKey,
            @Param("messageIds") Collection<Long> messageIds);
}
