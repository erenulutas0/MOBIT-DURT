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

    /**
     * The same, narrowed to one tender's documents. A question asked while looking at a specific
     * tender should be answered from that tender's own şartname — the answer to "what is the
     * penalty" is different for every contract, and the most similar passage across the whole
     * archive is very likely to be some other tender's.
     */
    @Query("select chunk from DocumentChunk chunk "
            + "where chunk.model = :model and chunk.documentId in :documentIds")
    List<DocumentChunk> findAllByModelAndDocumentIdIn(
            @Param("model") String model, @Param("documentIds") java.util.Collection<Long> documentIds);

    long countByModel(String model);

    boolean existsByDocumentId(Long documentId);

    @Modifying
    @Transactional
    @Query("delete from DocumentChunk chunk where chunk.documentId = :documentId")
    int deleteByDocumentId(@Param("documentId") Long documentId);
}
