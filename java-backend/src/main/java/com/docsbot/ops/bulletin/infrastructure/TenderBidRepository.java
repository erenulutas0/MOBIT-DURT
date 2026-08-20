package com.docsbot.ops.bulletin.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.bulletin.domain.TenderBid;

public interface TenderBidRepository extends JpaRepository<TenderBid, Long> {

    Optional<TenderBid> findByIkn(String ikn);

    /**
     * Every bid this company has made, newest first.
     *
     * <p>Returned whole and never purged. The bulletin behind it is a cached public document with a
     * retention window; what the company offered is its own memory, and an average that quietly
     * forgets last spring's losses is worse than no average.
     */
    List<TenderBid> findAllByOrderByBidAtDescIdDesc();
}
