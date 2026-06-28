package com.docsbot.ops.auth.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.auth.domain.AuthAuditEvent;

public interface AuthAuditEventRepository extends JpaRepository<AuthAuditEvent, Long> {

    List<AuthAuditEvent> findAllByOrderByCreatedAtAscIdAsc();
}
