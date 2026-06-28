package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTaskAssignment;

public interface ErpTaskAssignmentRepository extends JpaRepository<ErpTaskAssignment, Long> {

    List<ErpTaskAssignment> findAllByOrderByIdAsc();

    List<ErpTaskAssignment> findAllByTaskIdInOrderByIdAsc(Collection<Long> taskIds);

    List<ErpTaskAssignment> findAllByAssigneeUserId(Long userId);

    List<ErpTaskAssignment> findAllByAssigneeTeamIdIn(Collection<Long> teamIds);

    boolean existsByTaskIdAndAssigneeUserId(Long taskId, Long userId);
}
