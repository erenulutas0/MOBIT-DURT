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
            where (:admin = true and (message.senderType = 'admin' or message.recipientType = 'admin'))
               or (:admin = false and (
                    (message.senderType = 'user' and message.senderUserId = :userId)
                    or (message.recipientType = 'user' and message.recipientUserId = :userId)
               ))
            order by message.createdAt desc, message.id desc
            """)
    List<ErpDirectMessage> findVisible(
            @Param("admin") boolean admin,
            @Param("userId") Long userId,
            Pageable pageable);
}
