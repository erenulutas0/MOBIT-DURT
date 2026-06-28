package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.ErpNotification;

public interface ErpNotificationRepository extends JpaRepository<ErpNotification, Long> {

    List<ErpNotification> findTop50ByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    long countByUserIdAndReadAtIsNull(Long userId);

    boolean existsByUserIdAndEventKey(Long userId, String eventKey);

    @Modifying
    @Query("""
            update ErpNotification notification
               set notification.readAt = :readAt
             where notification.userId = :userId
               and notification.readAt is null
            """)
    int markAllRead(@Param("userId") Long userId, @Param("readAt") java.time.Instant readAt);

    void deleteAllByUserId(Long userId);
}
