package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.TenderOrganization;

public interface TenderOrganizationRepository
        extends JpaRepository<TenderOrganization, Long> {
    Optional<TenderOrganization> findByCode(String code);
    Optional<TenderOrganization> findByNameIgnoreCase(String name);
    List<TenderOrganization> findTop10ByActiveAndNameContainingIgnoreCaseOrderByNameAsc(
            Integer active,
            String name
    );
    Page<TenderOrganization> findByActiveOrderByNameAsc(Integer active, Pageable pageable);
}
