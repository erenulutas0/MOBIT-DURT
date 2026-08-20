package com.docsbot.ops.bulletin.infrastructure;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.bulletin.domain.TenderNotice;

public interface TenderNoticeRepository extends JpaRepository<TenderNotice, Long> {

    boolean existsByIknAndKindAndBulletinDateAndBulletinType(
            String ikn, String kind, LocalDate bulletinDate, String bulletinType);

    /**
     * Live announcements whose date has not passed, soonest first.
     *
     * <p>Cancellations are excluded here rather than at the call sites: a cancelled tender offered
     * as something to bid on is worse than an empty screen, and leaving that to be remembered
     * everywhere it is read guarantees somewhere forgets.
     */
    @Query("select notice from TenderNotice notice "
            + "where notice.kind = 'ilan' "
            + "  and (notice.tenderAt is null or notice.tenderAt >= :now) "
            + "  and (:province is null or notice.province = :province) "
            + "  and (:category is null or notice.category = :category) "
            + "  and (:bulletinType is null or notice.bulletinType = :bulletinType) "
            + "order by notice.tenderAt asc nulls last, notice.bulletinDate desc")
    List<TenderNotice> findOpen(
            @Param("now") Instant now,
            @Param("province") String province,
            @Param("category") String category,
            @Param("bulletinType") String bulletinType);

    /** How many live announcements each province has, for the map. */
    @Query("select notice.province, count(notice) from TenderNotice notice "
            + "where notice.kind = 'ilan' and notice.province is not null "
            + "  and (notice.tenderAt is null or notice.tenderAt >= :now) "
            + "group by notice.province order by count(notice) desc")
    List<Object[]> countOpenByProvince(@Param("now") Instant now);

    /** How many live announcements each line of work has, for the category filter's badges. */
    @Query("select notice.category, count(notice) from TenderNotice notice "
            + "where notice.kind = 'ilan' and notice.category is not null "
            + "  and (notice.tenderAt is null or notice.tenderAt >= :now) "
            + "group by notice.category order by count(notice) desc")
    List<Object[]> countOpenByCategory(@Param("now") Instant now);

    long countByBulletinDateAndBulletinType(LocalDate bulletinDate, String bulletinType);

    /**
     * The preparation tasks opened for one tender, by its İKN.
     *
     * <p>How a result finds the people who care about it. A company sees three hundred
     * announcements a day and bids on perhaps two; the ones it opened a task for are the ones whose
     * outcome it has been waiting weeks to hear, and everything else is somebody else's news.
     */
    @Query("select distinct notice.taskId from TenderNotice notice "
            + "where notice.ikn = :ikn and notice.taskId is not null")
    List<Long> findTaskIdsByIkn(@Param("ikn") String ikn);

    /**
     * The tenders this company is actually preparing for, soonest hour first.
     *
     * <p>A task is what separates the two a company is working on from the three hundred that
     * scrolled past its screen this morning — so the owner's briefing lists these and nothing else.
     */
    @Query("select notice from TenderNotice notice "
            + "where notice.taskId is not null and notice.tenderAt is not null "
            + "  and notice.tenderAt >= :now "
            + "order by notice.tenderAt asc")
    List<TenderNotice> findInPreparation(@Param("now") Instant now);

    /**
     * Drops announcements from bulletins older than the cutoff.
     *
     * <p>Around three hundred announcements a day arrive with the whole printed text attached,
     * which is a few megabytes a week and a few hundred megabytes a year of tenders that closed
     * long ago. Nothing here is unrecoverable — it is a public bulletin, still on EKAP's own site
     * — so the table is kept to what somebody might actually look at.
     *
     * <p>The transaction is declared here, on the repository, and not left to the caller. A
     * modifying query without one throws, and the caller is a scheduled method that invokes it on
     * itself — which never passes through the proxy, so an annotation over there would be read by
     * everyone as protection and provide none. This project has already lost a nightly purge to
     * exactly that.
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("delete from TenderNotice notice where notice.bulletinDate < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);
}
