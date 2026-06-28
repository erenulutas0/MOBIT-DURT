package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupDocument;

public interface DocumentGroupDocumentRepository extends JpaRepository<DocumentGroupDocument, Long> {
    List<DocumentGroupDocument> findAllByGroupIdOrderByCreatedAtDescIdDesc(long groupId);
    Optional<DocumentGroupDocument> findByIdAndGroupId(long id, long groupId);
}
