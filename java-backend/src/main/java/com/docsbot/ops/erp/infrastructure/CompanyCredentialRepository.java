package com.docsbot.ops.erp.infrastructure;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.CompanyCredential;

public interface CompanyCredentialRepository extends JpaRepository<CompanyCredential, Long> {

    /**
     * Soonest to lapse first, and the ones with no expiry last rather than first — a null date sorts
     * before every real one by default, which would put the documents that never need attention at
     * the top of a screen whose whole job is showing what needs attention.
     */
    @Query("select credential from CompanyCredential credential "
            + "order by case when credential.validUntil is null then 1 else 0 end, "
            + "credential.validUntil asc, credential.name asc")
    List<CompanyCredential> findAllByUrgency();

    /** Everything that lapses on or before the given date, for the reminder scan. */
    List<CompanyCredential> findByValidUntilNotNullAndValidUntilLessThanEqual(LocalDate limit);

    @Query("select count(credential) from CompanyCredential credential "
            + "where credential.validUntil is not null and credential.validUntil < :today")
    long countExpired(@Param("today") LocalDate today);
}
