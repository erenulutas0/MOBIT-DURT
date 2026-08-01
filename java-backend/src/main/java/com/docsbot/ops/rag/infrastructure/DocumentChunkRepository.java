package com.docsbot.ops.rag.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.rag.domain.DocumentChunk;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, Long> {

    /**
     * Every passage indexed by the current model. Search scans these in memory: at this corpus size
     * that is a few milliseconds, and it keeps the production database on its stock image. The
     * model filter is what stops vectors from two different models being compared, which would
     * rank confidently and wrongly.
     */
    List<DocumentChunk> findAllByModel(String model);

    long countByModel(String model);

    boolean existsByDocumentId(Long documentId);

    @Modifying
    @Transactional
    @Query("delete from DocumentChunk chunk where chunk.documentId = :documentId")
    int deleteByDocumentId(@Param("documentId") Long documentId);
}
