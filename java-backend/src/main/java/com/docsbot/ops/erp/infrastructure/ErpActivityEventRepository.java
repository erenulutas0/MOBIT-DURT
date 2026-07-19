package com.docsbot.ops.erp.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.ErpActivityEvent;

public interface ErpActivityEventRepository extends JpaRepository<ErpActivityEvent, Long> {

    List<ErpActivityEvent> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    Optional<ErpActivityEvent> findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc(
            Long taskId,
            String eventType);

    /** Prune audit rows older than the retention cutoff — this append-only log grows unbounded otherwise. */
    @Modifying
    @Transactional
    @Query("delete from ErpActivityEvent event where event.createdAt < :cutoff")
    int deleteCreatedBefore(@Param("cutoff") Instant cutoff);
}
