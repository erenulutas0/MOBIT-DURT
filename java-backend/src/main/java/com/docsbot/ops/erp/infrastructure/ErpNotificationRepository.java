package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
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

    /**
     * Collapses a task's deadline-alert stack for one recipient: marks every still-unread alert of
     * the given types for this (recipient, task) as read, so a freshly created alert supersedes the
     * now-obsolete earlier stages (72h → 48h → … → overdue → nudge) instead of piling up. History
     * is preserved (rows stay, just flipped to read) so nothing vanishes; only the badge shrinks.
     */
    @Modifying
    @Query("""
            update ErpNotification notification
               set notification.readAt = :readAt
             where notification.userId = :userId
               and notification.taskId = :taskId
               and notification.readAt is null
               and notification.type in :types
            """)
    int markTaskDeadlineAlertsSuperseded(
            @Param("userId") long userId,
            @Param("taskId") long taskId,
            @Param("types") Collection<String> types,
            @Param("readAt") java.time.Instant readAt);

    void deleteAllByUserId(Long userId);

    /**
     * Clears the dedup event keys of past alerts for a task so they can fire again,
     * without deleting the notifications from the recipients' history.
     */
    @Modifying
    @Query("""
            update ErpNotification notification
               set notification.eventKey = null
             where notification.taskId = :taskId
               and notification.eventKey is not null
               and notification.type in :types
            """)
    int detachEventKeys(@Param("taskId") long taskId, @Param("types") Collection<String> types);
}
