package com.docsbot.ops.tender.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.tender.domain.DocumentGroupMessage;

public interface DocumentGroupMessageRepository extends JpaRepository<DocumentGroupMessage, Long> {
    List<DocumentGroupMessage> findAllByGroupIdOrderByCreatedAtAscIdAsc(long groupId);

    List<DocumentGroupMessage> findAllByGroupIdAndIdLessThanEqualOrderByIdAsc(long groupId, long id);

    @Query("""
            select message
            from DocumentGroupMessage message
            where message.groupId = :groupId
              and ((:authorUserId is null and message.authorUserId is null) or message.authorUserId = :authorUserId)
              and message.clientMessageId = :clientMessageId
            order by message.id desc
            """)
    List<DocumentGroupMessage> findByClientMessageId(
            @Param("groupId") long groupId,
            @Param("authorUserId") Long authorUserId,
            @Param("clientMessageId") String clientMessageId,
            Pageable pageable);

    @Query("""
            select message
            from DocumentGroupMessage message
            where message.groupId = :groupId
              and (:beforeId is null or message.id < :beforeId)
              and not exists (
                select receipt.id
                from DocumentGroupMessageHiddenReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
            order by message.createdAt desc, message.id desc
            """)
    List<DocumentGroupMessage> findLatestByGroupId(
            @Param("groupId") long groupId,
            @Param("beforeId") Long beforeId,
            @Param("actorKey") String actorKey,
            Pageable pageable);

    @Query("""
            select new com.docsbot.ops.tender.infrastructure.GroupCount(message.groupId, count(message.id))
            from DocumentGroupMessage message
            where message.groupId in :groupIds
              and (
                (:admin = true and message.authorUserId is not null)
                or (:admin = false and (:currentUserId is null or message.authorUserId is null or message.authorUserId <> :currentUserId))
              )
              and not exists (
                select receipt.id
                from DocumentGroupMessageReadReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
              and not exists (
                select hidden.id
                from DocumentGroupMessageHiddenReceipt hidden
                where hidden.messageId = message.id
                  and hidden.actorKey = :actorKey
              )
            group by message.groupId
            """)
    List<GroupCount> countUnreadByGroupIdIn(
            @Param("groupIds") Collection<Long> groupIds,
            @Param("actorKey") String actorKey,
            @Param("admin") boolean admin,
            @Param("currentUserId") Long currentUserId);

    @Query("""
            select message
            from DocumentGroupMessage message
            where message.groupId in :groupIds
              and lower(message.body) like lower(concat('%', :term, '%'))
              and not exists (
                select receipt.id
                from DocumentGroupMessageHiddenReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
            order by message.createdAt desc, message.id desc
            """)
    List<DocumentGroupMessage> searchVisible(
            @Param("groupIds") Collection<Long> groupIds,
            @Param("actorKey") String actorKey,
            @Param("term") String term,
            Pageable pageable);
}
