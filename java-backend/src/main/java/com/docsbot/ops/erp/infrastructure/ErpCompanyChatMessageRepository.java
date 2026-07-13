package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpCompanyChatMessage;

public interface ErpCompanyChatMessageRepository extends JpaRepository<ErpCompanyChatMessage, Long> {

    List<ErpCompanyChatMessage> findAllByOrderByCreatedAtAscIdAsc();
}
