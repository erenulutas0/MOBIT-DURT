package com.docsbot.ops.bulletin.infrastructure;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.bulletin.domain.TenderResult;

public interface TenderResultRepository extends JpaRepository<TenderResult, Long> {

    boolean existsByIknAndBulletinDateAndBulletinTypeAndAwardKey(
            String ikn, LocalDate bulletinDate, String bulletinType, String awardKey);

    /** Every contract already recorded under one İKN — how a lot award is recognised. */
    List<TenderResult> findByIkn(String ikn);

    /**
     * Recent results, newest first, optionally narrowed to a province and a line of work.
     *
     * <p>Ordered by the contract date rather than the bulletin's: a result published today may have
     * been signed weeks ago, and "what has just been let" is the question this screen answers.
     */
    @Query("select result from TenderResult result "
            + "where (:province is null or result.province = :province) "
            + "  and (:category is null or result.category = :category) "
            + "  and (:bulletinType is null or result.bulletinType = :bulletinType) "
            + "order by result.contractDate desc nulls last, result.bulletinDate desc, result.id desc")
    List<TenderResult> findRecent(
            @Param("province") String province,
            @Param("category") String category,
            @Param("bulletinType") String bulletinType);

    /**
     * Marks every contract under an İKN as a lot award.
     *
     * <p>Lots of one tender are published days apart, so the row stored today is only revealed to
     * be partial when tomorrow's arrives — which means correcting what is already stored, not just
     * deciding better next time.
     *
     * <p>The transaction is declared here rather than left to the caller: a modifying query without
     * one throws, and the caller reaches this from a scheduled method on its own class, where an
     * annotation would never pass through the proxy. This project has already lost a nightly purge
     * to exactly that.
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("update TenderResult result set result.partialAward = true where result.ikn = :ikn")
    int markPartialByIkn(@Param("ikn") String ikn);

    /** Same retention window as the announcements, and for the same reason: it is a public file. */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("delete from TenderResult result where result.bulletinDate < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);
}
