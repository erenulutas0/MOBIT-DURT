package com.docsbot.ops.erp.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpActivityEvent;

public interface ErpActivityEventRepository extends JpaRepository<ErpActivityEvent, Long> {

    List<ErpActivityEvent> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    Optional<ErpActivityEvent> findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc(
            Long taskId,
            String eventType);
}
