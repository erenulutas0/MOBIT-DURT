package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.erp.domain.ErpNotification;

public interface ErpNotificationRepository extends JpaRepository<ErpNotification, Long> {

    List<ErpNotification> findTop50ByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    long countByUserIdAndReadAtIsNull(Long userId);

    boolean existsByUserIdAndEventKey(Long userId, String eventKey);

    @Modifying
    @Transactional
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
    @Transactional
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
     * Retires a recipient's earlier unread copies of a cross-task digest type. These carry no task
     * id, so the per-task supersede cannot reach them; only the newest digest is actionable.
     */
    @Modifying
    @Transactional
    @Query("""
            update ErpNotification notification
               set notification.readAt = :readAt
             where notification.userId = :userId
               and notification.type = :type
               and notification.readAt is null
            """)
    int markDigestSuperseded(
            @Param("userId") long userId,
            @Param("type") String type,
            @Param("readAt") java.time.Instant readAt);

    /**
     * Backstop against a permanently lit badge: an alert nobody acted on within the retention window
     * is retired. Without this, any unread row that never gets a newer same-task sibling to supersede
     * it stays unread forever — which is how a fresh install still saw a stuck ~49.
     */
    @Modifying
    @Transactional
    @Query("""
            update ErpNotification notification
               set notification.readAt = :readAt
             where notification.readAt is null
               and notification.createdAt < :cutoff
               and notification.type in :types
            """)
    int markStaleUnreadRead(
            @Param("cutoff") java.time.Instant cutoff,
            @Param("types") Collection<String> types,
            @Param("readAt") java.time.Instant readAt);

    /** Prunes long-settled history so the table stays bounded (read rows only — unread are kept). */
    @Modifying
    @Transactional
    @Query("""
            delete from ErpNotification notification
             where notification.readAt is not null
               and notification.createdAt < :cutoff
            """)
    int deleteReadCreatedBefore(@Param("cutoff") java.time.Instant cutoff);

    /**
     * Retires every outstanding notification for a settled task, for all recipients. A completed or
     * cancelled task must not keep anything lit in anyone's bell — not "termini yaklaşıyor", not a
     * pending completion request. Since no newer alert will ever arrive for it, the per-task
     * supersede could never clear these on its own.
     */
    @Modifying
    @Transactional
    @Query("""
            update ErpNotification notification
               set notification.readAt = :readAt
             where notification.taskId = :taskId
               and notification.readAt is null
            """)
    int markAllTaskNotificationsRead(
            @Param("taskId") long taskId,
            @Param("readAt") java.time.Instant readAt);

    /**
     * Clears the dedup event keys of past alerts for a task so they can fire again,
     * without deleting the notifications from the recipients' history.
     */
    @Modifying
    @Transactional
    @Query("""
            update ErpNotification notification
               set notification.eventKey = null
             where notification.taskId = :taskId
               and notification.eventKey is not null
               and notification.type in :types
            """)
    int detachEventKeys(@Param("taskId") long taskId, @Param("types") Collection<String> types);
}
