package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.TenderDocument;

public interface TenderDocumentRepository extends JpaRepository<TenderDocument, Long> {
    List<TenderDocument> findAllByOrderByTimestampDescIdDesc();
    List<TenderDocument> findAllByChecksumAndTenderIdOrderByIdDesc(
            String checksum,
            String tenderId
    );
    Optional<TenderDocument> findFirstByMessageId(String messageId);
    List<TenderDocument> findTop10ByTenderIdOrderByTimestampDescIdDesc(String tenderId);
    List<TenderDocument> findAllByTenderIdOrderByTimestampDescIdDesc(String tenderId);
}
