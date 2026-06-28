package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTaskDocument;

public interface ErpTaskDocumentRepository extends JpaRepository<ErpTaskDocument, Long> {

    List<ErpTaskDocument> findAllByTaskIdOrderByCreatedAtDescIdDesc(Long taskId);

    List<ErpTaskDocument> findAllByTaskIdInOrderByCreatedAtDescIdDesc(Collection<Long> taskIds);
}
