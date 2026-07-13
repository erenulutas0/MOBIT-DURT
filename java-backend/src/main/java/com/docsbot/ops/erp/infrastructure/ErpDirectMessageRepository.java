package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.ErpDirectMessage;

public interface ErpDirectMessageRepository extends JpaRepository<ErpDirectMessage, Long> {

    @Query("""
            select message
            from ErpDirectMessage message
            where message.senderType = :senderType
              and ((:senderUserId is null and message.senderUserId is null) or message.senderUserId = :senderUserId)
              and message.clientMessageId = :clientMessageId
            order by message.id desc
            """)
    List<ErpDirectMessage> findByClientMessageId(
            @Param("senderType") String senderType,
            @Param("senderUserId") Long senderUserId,
            @Param("clientMessageId") String clientMessageId,
            Pageable pageable);

    @Query("""
            select message
            from ErpDirectMessage message
            where (
              (:admin = true and (message.senderType = 'admin' or message.recipientType = 'admin'))
              or (:admin = false and (
                    (message.senderType = 'user' and message.senderUserId = :userId)
                    or (message.recipientType = 'user' and message.recipientUserId = :userId)
              ))
            )
              and not exists (
                select receipt.id
                from ErpDirectMessageHiddenReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
            order by message.createdAt desc, message.id desc
            """)
    List<ErpDirectMessage> findVisible(
            @Param("admin") boolean admin,
            @Param("userId") Long userId,
            @Param("actorKey") String actorKey,
            Pageable pageable);

    @Query("""
            select message
            from ErpDirectMessage message
            where message.id < :beforeId
              and (
                (:admin = true and (message.senderType = 'admin' or message.recipientType = 'admin'))
                or (:admin = false and (
                    (message.senderType = 'user' and message.senderUserId = :userId)
                    or (message.recipientType = 'user' and message.recipientUserId = :userId)
                ))
              )
              and not exists (
                select receipt.id
                from ErpDirectMessageHiddenReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
            order by message.createdAt desc, message.id desc
            """)
    List<ErpDirectMessage> findVisibleBefore(
            @Param("admin") boolean admin,
            @Param("userId") Long userId,
            @Param("beforeId") long beforeId,
            @Param("actorKey") String actorKey,
            Pageable pageable);

    @Query("""
            select message
            from ErpDirectMessage message
            where lower(message.body) like lower(concat('%', :term, '%'))
              and (
                (:admin = true and (message.senderType = 'admin' or message.recipientType = 'admin'))
                or (:admin = false and (
                      (message.senderType = 'user' and message.senderUserId = :userId)
                      or (message.recipientType = 'user' and message.recipientUserId = :userId)
                ))
              )
              and not exists (
                select receipt.id
                from ErpDirectMessageHiddenReceipt receipt
                where receipt.messageId = message.id
                  and receipt.actorKey = :actorKey
              )
            order by message.createdAt desc, message.id desc
            """)
    List<ErpDirectMessage> searchVisible(
            @Param("admin") boolean admin,
            @Param("userId") Long userId,
            @Param("actorKey") String actorKey,
            @Param("term") String term,
            Pageable pageable);
}
