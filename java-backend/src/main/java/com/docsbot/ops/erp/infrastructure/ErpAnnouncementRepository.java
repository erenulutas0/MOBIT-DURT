package com.docsbot.ops.erp.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpAnnouncement;

public interface ErpAnnouncementRepository extends JpaRepository<ErpAnnouncement, Long> {

    Optional<ErpAnnouncement> findFirstByActiveTrueOrderByUpdatedAtDescIdDesc();

    List<ErpAnnouncement> findAllByActiveTrue();
}
