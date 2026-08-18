package com.docsbot.ops.bulletin.infrastructure;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.bulletin.domain.TenderResult;

public interface TenderResultRepository extends JpaRepository<TenderResult, Long> {

    boolean existsByIknAndBulletinDateAndBulletinTypeAndAwardKey(
            String ikn, LocalDate bulletinDate, String bulletinType, String awardKey);

    /** Every contract already recorded under one İKN, for the screen that asks about one tender. */
    List<TenderResult> findByIkn(String ikn);

    /**
     * Whether this tender has already produced a contract — how a lot award is recognised.
     *
     * <p>A count rather than the rows, because the ingest asks this once per result and the answer
     * it needs is a yes or a no. Fetching the rows meant a fifty-lot tender loading forty-nine
     * announcement bodies fifty times over, which is quadratic in something the bulletin is free
     * to make large.
     */
    boolean existsByIkn(String ikn);

    /**
     * Recent results, newest first, optionally narrowed to a province and a line of work.
     *
     * <p>Ordered by the contract date rather than the bulletin's: a result published today may have
     * been signed weeks ago, and "what has just been let" is the question this screen answers.
     *
     * <p>The page size is applied here and not by the caller. Trimming a list in Java after the
     * database has handed over every row costs nothing less: each row carries the announcement as
     * printed, the table already holds 12 MB of that text and grows by around 1,400 contracts a
     * day, and a connection stays occupied for the whole of it. The screen shows fifty.
     */
    @Query("select result from TenderResult result "
            + "where (:province is null or result.province = :province) "
            + "  and (:category is null or result.category = :category) "
            + "  and (:bulletinType is null or result.bulletinType = :bulletinType) "
            + "order by result.contractDate desc nulls last, result.bulletinDate desc, result.id desc")
    List<TenderResult> findRecent(
            @Param("province") String province,
            @Param("category") String category,
            @Param("bulletinType") String bulletinType,
            Pageable page);

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

    /**
     * Every award recorded for one idare, newest contract first.
     *
     * <p>Returned whole rather than aggregated in SQL because the discount is a domain decision,
     * not an arithmetic one: which awards count towards an average is decided by
     * {@code TenderResult#discountStatus()}, and a median computed in the query would quietly
     * include the lot awards that method exists to keep out.
     */
    List<TenderResult> findByAuthorityOrderByContractDateDescIdDesc(String authority);

    /** Same retention window as the announcements, and for the same reason: it is a public file. */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("delete from TenderResult result where result.bulletinDate < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);
}
