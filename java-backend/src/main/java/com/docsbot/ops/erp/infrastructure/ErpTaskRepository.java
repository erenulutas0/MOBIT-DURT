package com.docsbot.ops.erp.infrastructure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.docsbot.ops.erp.domain.ErpTask;

public interface ErpTaskRepository extends JpaRepository<ErpTask, Long> {

    List<ErpTask> findAllByOrderByCreatedAtDescIdDesc();

    List<ErpTask> findAllByIdInOrderByCreatedAtDescIdDesc(Collection<Long> ids);

    List<ErpTask> findAllByStatusOrderByCreatedAtDescIdDesc(
            com.docsbot.ops.erp.domain.TaskStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<ErpTask> findAllByDeadlineAtBeforeAndStatusIn(
            Instant deadline,
            Collection<com.docsbot.ops.erp.domain.TaskStatus> statuses);

    List<ErpTask> findAllByDeadlineAtBetweenAndStatusIn(
            Instant startsAt,
            Instant endsAt,
            Collection<com.docsbot.ops.erp.domain.TaskStatus> statuses);

    boolean existsByWorkflowTemplateIdAndScheduledFor(long workflowTemplateId, Instant scheduledFor);

    List<ErpTask> findAllByParentTaskIdOrderByCreatedAtAscIdAsc(long parentTaskId);

    boolean existsByParentTaskIdAndStatusIn(
            long parentTaskId,
            Collection<com.docsbot.ops.erp.domain.TaskStatus> statuses);

    /** All open tasks ordered by urgency (nearest deadline first, undated last). */
    List<ErpTask> findAllByStatusInOrderByDeadlineAtAscIdAsc(
            Collection<com.docsbot.ops.erp.domain.TaskStatus> statuses);
}
