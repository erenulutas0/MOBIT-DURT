package com.docsbot.ops.erp.infrastructure;

import java.time.Instant;
import java.util.List;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.docsbot.ops.erp.domain.ErpWorkflowTemplate;

public interface ErpWorkflowTemplateRepository extends JpaRepository<ErpWorkflowTemplate, Long> {

    List<ErpWorkflowTemplate> findAllByOrderByCreatedAtDescIdDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<ErpWorkflowTemplate> findTop50ByActiveTrueAndNextRunAtLessThanEqualOrderByNextRunAtAscIdAsc(Instant now);
}
