package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.Tender;

public interface TenderRepository extends JpaRepository<Tender, Long> {
    List<Tender> findAllByOrderByYearDescTenderIdAsc();
    List<Tender> findAllByTenderIdStartingWith(String prefix);
    Optional<Tender> findByTenderId(String tenderId);
}
