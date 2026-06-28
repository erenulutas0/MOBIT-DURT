package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpWorkflowTemplateAssignment;

public interface ErpWorkflowTemplateAssignmentRepository
        extends JpaRepository<ErpWorkflowTemplateAssignment, Long> {

    List<ErpWorkflowTemplateAssignment> findAllByTemplateIdInOrderByIdAsc(Collection<Long> templateIds);

    void deleteAllByTemplateId(long templateId);
}
