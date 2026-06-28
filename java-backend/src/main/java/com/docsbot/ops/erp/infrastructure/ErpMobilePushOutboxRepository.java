package com.docsbot.ops.erp.infrastructure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;

public interface ErpMobilePushOutboxRepository extends JpaRepository<ErpMobilePushOutbox, Long> {

    boolean existsByNotificationIdAndTokenId(long notificationId, long tokenId);

    List<ErpMobilePushOutbox> findTop50ByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            Collection<String> statuses,
            Instant now
    );
}

