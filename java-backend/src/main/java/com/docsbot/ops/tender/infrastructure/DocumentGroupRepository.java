package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Collection;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroup;

public interface DocumentGroupRepository extends JpaRepository<DocumentGroup, Long> {
    List<DocumentGroup> findAllByArchivedAtIsNullOrderByUpdatedAtDescIdDesc();
    List<DocumentGroup> findAllByIdInAndArchivedAtIsNullOrderByUpdatedAtDescIdDesc(Collection<Long> ids);
}
