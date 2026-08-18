package com.docsbot.ops.bulletin.infrastructure;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.bulletin.domain.CompanyQualification;

public interface CompanyQualificationRepository extends JpaRepository<CompanyQualification, Long> {

    /** One row, seeded by the migration — the company's own position, not a per-user one. */
    Optional<CompanyQualification> findFirstByOrderByIdAsc();
}
