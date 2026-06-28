package com.docsbot.ops.tender.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupMessage;

public interface DocumentGroupMessageRepository extends JpaRepository<DocumentGroupMessage, Long> {
    List<DocumentGroupMessage> findAllByGroupIdOrderByCreatedAtAscIdAsc(long groupId);
}
