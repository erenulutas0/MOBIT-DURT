package com.docsbot.ops.erp.infrastructure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;

public interface ErpMobilePushOutboxRepository extends JpaRepository<ErpMobilePushOutbox, Long> {

    boolean existsByNotificationIdAndTokenId(long notificationId, long tokenId);

    List<ErpMobilePushOutbox> findTop50ByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            Collection<String> statuses,
            Instant now
    );

    /** Prune terminal-state (delivered/dead) rows that settled before the cutoff; retry/pending are kept. */
    @Modifying
    @Transactional
    @Query("""
            delete from ErpMobilePushOutbox outbox
             where outbox.status in :terminalStatuses
               and outbox.updatedAt < :cutoff
            """)
    int deleteTerminalUpdatedBefore(
            @Param("terminalStatuses") Collection<String> terminalStatuses,
            @Param("cutoff") Instant cutoff);
}

