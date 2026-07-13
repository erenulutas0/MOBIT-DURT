package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTaskDependency;

public interface ErpTaskDependencyRepository extends JpaRepository<ErpTaskDependency, Long> {

    List<ErpTaskDependency> findAllBySuccessorTaskId(long successorTaskId);

    List<ErpTaskDependency> findAllByPredecessorTaskId(long predecessorTaskId);

    List<ErpTaskDependency> findAllBySuccessorTaskIdIn(Collection<Long> successorTaskIds);

    boolean existsByPredecessorTaskIdAndSuccessorTaskId(long predecessorTaskId, long successorTaskId);

    long deleteByPredecessorTaskIdAndSuccessorTaskId(long predecessorTaskId, long successorTaskId);
}
