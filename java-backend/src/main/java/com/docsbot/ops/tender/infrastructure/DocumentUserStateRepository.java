package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentUserState;

public interface DocumentUserStateRepository extends JpaRepository<DocumentUserState, Long> {

    Optional<DocumentUserState> findByOwnerKeyAndDocumentId(String ownerKey, long documentId);

    List<DocumentUserState> findByOwnerKeyAndFavoriteTrueOrderByFavoritedAtDescIdDesc(String ownerKey);

    List<DocumentUserState> findByOwnerKeyAndLastAccessedAtIsNotNullOrderByLastAccessedAtDescIdDesc(
            String ownerKey,
            Pageable pageable);
}
