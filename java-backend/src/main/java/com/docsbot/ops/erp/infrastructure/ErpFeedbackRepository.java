package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpFeedback;

public interface ErpFeedbackRepository extends JpaRepository<ErpFeedback, Long> {

    List<ErpFeedback> findAllByOrderByCreatedAtDescIdDesc();

    List<ErpFeedback> findAllByStatusOrderByCreatedAtDescIdDesc(String status);
}
