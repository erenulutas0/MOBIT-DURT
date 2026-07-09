package com.docsbot.ops.tender.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupDocumentVersion;

public interface DocumentGroupDocumentVersionRepository extends JpaRepository<DocumentGroupDocumentVersion, Long> {
    List<DocumentGroupDocumentVersion> findAllByGroupDocumentIdOrderByVersionNumberDescIdDesc(long groupDocumentId);
    long countByGroupDocumentId(long groupDocumentId);
}
