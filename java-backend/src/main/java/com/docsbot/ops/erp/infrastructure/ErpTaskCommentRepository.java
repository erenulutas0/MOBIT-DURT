package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTaskComment;

public interface ErpTaskCommentRepository extends JpaRepository<ErpTaskComment, Long> {

    List<ErpTaskComment> findAllByTaskIdInOrderByCreatedAtDescIdDesc(Collection<Long> taskIds);
}
