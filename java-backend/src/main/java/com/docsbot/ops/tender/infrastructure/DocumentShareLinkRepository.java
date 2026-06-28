package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentShareLink;

public interface DocumentShareLinkRepository extends JpaRepository<DocumentShareLink, Long> {

    Optional<DocumentShareLink> findByTokenHash(String tokenHash);

    List<DocumentShareLink> findAllByDocumentIdOrderByCreatedAtDescIdDesc(long documentId);
}
