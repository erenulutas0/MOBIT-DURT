package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.domain.ErpNotificationPreference;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

@Service
@Profile("postgres")
public class NotificationService {

    /** Alert types whose event keys are re-armed when a task deadline changes. */
    private static final Set<String> DEADLINE_ALERT_TYPES = Set.of(
            "task_due_soon",
            "manager_due_soon_digest",
            "task_overdue",
            "manager_overdue_digest",
            // Escalation nudges must re-arm too: after a deadline extension the already-crossed
            // stages would otherwise stay burned and the ladder would be silent for the task's
            // remaining life.
            "task_overdue_nudge");

    private final ErpNotificationRepository notificationRepository;
    private final ErpNotificationPreferenceRepository preferenceRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;
    private final NotificationEventPublisher eventPublisher;
    private final WebPushService webPushService;
    private final MobilePushService mobilePushService;
    private final EmailNotificationService emailNotificationService;
    private final Clock clock;

    @Autowired
    public NotificationService(
            ErpNotificationRepository notificationRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            NotificationEventPublisher eventPublisher,
            WebPushService webPushService,
            MobilePushService mobilePushService,
            EmailNotificationService emailNotificationService
    ) {
        this(
                notificationRepository,
                preferenceRepository,
                deliveryRepository,
                eventPublisher,
                webPushService,
                mobilePushService,
                emailNotificationService,
                Clock.systemUTC());
    }

    NotificationService(
            ErpNotificationRepository notificationRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            NotificationEventPublisher eventPublisher,
            WebPushService webPushService,
            MobilePushService mobilePushService,
            EmailNotificationService emailNotificationService,
            Clock clock
    ) {
        this.notificationRepository = notificationRepository;
        this.preferenceRepository = preferenceRepository;
        this.deliveryRepository = deliveryRepository;
        this.eventPublisher = eventPublisher;
        this.webPushService = webPushService;
        this.mobilePushService = mobilePushService;
        this.emailNotificationService = emailNotificationService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ErpNotification> listNotifications(ErpPrincipal principal) {
        return notificationRepository.findTop50ByUserIdOrderByCreatedAtDescIdDesc(recipientId(principal));
    }

    @Transactional(readOnly = true)
    public long unreadCount(ErpPrincipal principal) {
        return notificationRepository.countByUserIdAndReadAtIsNull(recipientId(principal));
    }

    @Transactional(readOnly = true)
    public SseEmitter stream(ErpPrincipal principal) {
        return eventPublisher.subscribe(recipientId(principal));
    }

    @Transactional
    public ErpNotification markRead(ErpPrincipal principal, long notificationId) {
        ErpNotification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Notification not found"));
        if (notification.getUserId() != recipientId(principal)) {
            throw new ErpExceptions.NotFound("Notification not found");
        }
        notification.markRead(clock.instant());
        long userId = notification.getUserId();
        afterCommit(() -> eventPublisher.publishUnreadCount(userId, unreadCount(userId)));
        return notification;
    }

    @Transactional
    public int markAllRead(ErpPrincipal principal) {
        long userId = recipientId(principal);
        int updated = notificationRepository.markAllRead(userId, clock.instant());
        afterCommit(() -> eventPublisher.publishUnreadCount(userId, unreadCount(userId)));
        return updated;
    }

    @Transactional
    public ErpNotificationPreference preferences(ErpPrincipal principal) {
        long userId = principal.admin() ? ErpNotification.ADMIN_RECIPIENT_ID : principal.requireUserId();
        return preferenceRepository.findById(userId)
                .orElseGet(() -> preferenceRepository.save(ErpNotificationPreference.defaults(
                        userId,
                        clock.instant())));
    }

    @Transactional
    public ErpNotificationPreference updatePreferences(
            ErpPrincipal principal,
            Boolean taskAssignedEnabled,
            Boolean managerMessageEnabled,
            Boolean employeeHelpMessageEnabled,
            Boolean completionUpdatesEnabled,
            Boolean deadlineAlertsEnabled,
            Boolean browserPushEnabled,
            Boolean mobilePushEnabled,
            Boolean emailEnabled
    ) {
        ErpNotificationPreference preference = preferences(principal);
        preference.update(
                taskAssignedEnabled,
                managerMessageEnabled,
                employeeHelpMessageEnabled,
                completionUpdatesEnabled,
                deadlineAlertsEnabled,
                browserPushEnabled,
                mobilePushEnabled,
                emailEnabled,
                clock.instant());
        return preference;
    }

    @Transactional
    public int notifyUsers(
            Collection<Long> userIds,
            String type,
            String title,
            String body,
            Long taskId,
            String priority,
            String eventKeyPrefix,
            Instant now
    ) {
        Set<Long> uniqueUserIds = new LinkedHashSet<>(userIds == null ? List.of() : userIds);
        int created = 0;
        for (long userId : uniqueUserIds) {
            String eventKey = eventKeyPrefix == null ? null : eventKeyPrefix + ":user:" + userId;
            created += notifyRecipient(userId, type, title, body, taskId, priority, eventKey, now);
        }
        return created;
    }

    @Transactional
    public int notifyAdmin(
            String type,
            String title,
            String body,
            Long taskId,
            String priority,
            String eventKey,
            Instant now
    ) {
        return notifyRecipient(
                ErpNotification.ADMIN_RECIPIENT_ID,
                type,
                title,
                body,
                taskId,
                priority,
                eventKey,
                now);
    }

    /**
     * Re-arms deadline alerts for a task after its deadline changed: the dedup event keys of
     * already-sent due-soon/overdue notifications are detached so the deadline scans can alert
     * again for the new deadline. History stays visible to recipients.
     */
    @Transactional
    public int rearmDeadlineAlerts(long taskId) {
        return notificationRepository.detachEventKeys(taskId, DEADLINE_ALERT_TYPES);
    }

    @Transactional
    public void deleteAllForUser(long userId) {
        notificationRepository.deleteAllByUserId(userId);
        preferenceRepository.deleteById(userId);
    }

    private int notifyRecipient(
            long recipientId,
            String type,
            String title,
            String body,
            Long taskId,
            String priority,
            String eventKey,
            Instant now
    ) {
        if (!allows(recipientId, type)) {
            return 0;
        }
        if (eventKey != null && notificationRepository.existsByUserIdAndEventKey(recipientId, eventKey)) {
            return 0;
        }
        try {
            ErpNotification notification = notificationRepository.saveAndFlush(ErpNotification.create(
                    recipientId,
                    type,
                    title,
                    body,
                    taskId,
                    priority,
                    eventKey,
                    now));
            deliveryRepository.save(ErpNotificationDelivery.accepted(notification.getId(), "IN_APP", now));
            mobilePushService.deliver(notification);
            afterCommit(() -> {
                eventPublisher.publishNotification(notification, unreadCount(recipientId));
                webPushService.deliver(notification);
                emailNotificationService.deliver(notification);
            });
            return 1;
        } catch (DataIntegrityViolationException exception) {
            return 0;
        }
    }

    private boolean allows(long userId, String type) {
        if (userId == ErpNotification.ADMIN_RECIPIENT_ID) {
            return true;
        }
        return preferenceRepository.findById(userId)
                .map(preference -> preference.allows(type))
                .orElse(true);
    }

    private long recipientId(ErpPrincipal principal) {
        return principal.admin() ? ErpNotification.ADMIN_RECIPIENT_ID : principal.requireUserId();
    }

    private long unreadCount(long recipientId) {
        return notificationRepository.countByUserIdAndReadAtIsNull(recipientId);
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
