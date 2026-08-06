package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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

    /**
     * Per-task deadline alerts that supersede each other for a single recipient: only the newest
     * matters (a 24h warning obsoletes the 72h one; "overdue" obsoletes "due soon"; the latest
     * nudge obsoletes the earlier one). Creating one marks the recipient's earlier same-task alerts
     * read, so one task shows one live deadline alert instead of a 12-deep pile in the bell.
     * manager_overdue_escalation is intentionally excluded — it carries no task id (it's already a
     * single cross-task digest).
     */
    private static final Set<String> DEADLINE_SUPERSEDE_TYPES = Set.of(
            "task_due_soon",
            "task_overdue",
            "task_overdue_nudge",
            "manager_due_soon_digest",
            "manager_overdue_digest");

    /**
     * Per-task alerts where only the newest of that SAME type matters. Two groups live here:
     * escalation rungs (a later rung obsoletes the earlier one), and the task-chatter types whose
     * call sites pass a null event key — those get no dedup at all (the unique index is partial,
     * {@code WHERE event_key IS NOT NULL}), so every task edit or comment used to mint a permanent
     * unread row. These never cross-supersede the deadline family: a deadline warning must not
     * silence a "task is blocked" escalation, and vice versa.
     */
    private static final Set<String> TASK_SAME_TYPE_SUPERSEDE_TYPES = Set.of(
            "task_blocked_escalation",
            "task_completion_approval_escalation",
            "task_updated",
            "manager_message",
            "employee_help_message",
            "task_completion_requested",
            "task_completion_approved",
            "task_completion_rejected");

    /**
     * Recurring digests and reports that carry no task id, so the per-task supersede can never reach
     * them — each would otherwise add a row every week/day forever. Only the newest of each kind is
     * actionable, so a new one retires the recipient's previous unread copies of that same type.
     */
    private static final Set<String> DIGEST_SUPERSEDE_TYPES = Set.of(
            "manager_overdue_escalation",
            "manager_weekly_digest",
            "performance_report",
            "assistant_briefing",
            // Per-recipient combined deadline alerts: they carry no task id either, so only the
            // newest of each kind is worth keeping live.
            "task_due_soon_digest",
            "task_overdue_digest",
            "task_overdue_nudge_digest");

    /**
     * Machine-generated alerts whose relevance EXPIRES, so the retention backstop may retire them
     * once they are old. Deliberately excludes anything a human sent or that represents work handed
     * to someone (direct_message, task_assigned, manager_message, feedback, account requests…): a
     * three-week-old "termini yaklaşıyor" is noise, but a three-week-old message from a colleague is
     * still unread mail and must survive two weeks of annual leave.
     */
    public static final Set<String> EXPIRING_ALERT_TYPES = Stream
            .of(DEADLINE_SUPERSEDE_TYPES.stream(),
                    DIGEST_SUPERSEDE_TYPES.stream(),
                    Stream.of("task_blocked_escalation", "task_completion_approval_escalation",
                            "tender_deadline_soon", "tender_deadline_passed",
                            // A "belge süresi doluyor" from two months ago is about a date that has
                            // been and gone; the record itself stays, so nothing is lost by
                            // retiring the alert.
                            CompanyCredentialService.EXPIRY_TYPE))
            .flatMap(stream -> stream)
            .collect(Collectors.toUnmodifiableSet());

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

    /**
     * Retires everything a settled task is still nagging about, for every recipient. Since no newer
     * alert will ever arrive for a done/cancelled task, the per-task supersede would never clear
     * these rows on its own and they would sit unread forever.
     */
    @Transactional
    public int clearTaskNotifications(long taskId) {
        return notificationRepository.markAllTaskNotificationsRead(taskId, clock.instant());
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
            // Collapse the task's earlier deadline alerts into this new one so the bell (and badge)
            // carry one live alert per task, not the whole 72h/48h/…/overdue/nudge stack. Only runs
            // when a genuinely new alert is about to be created (post-dedup), so re-scans are no-ops.
            if (taskId != null && DEADLINE_SUPERSEDE_TYPES.contains(type)) {
                notificationRepository.markTaskDeadlineAlertsSuperseded(
                        recipientId, taskId, DEADLINE_SUPERSEDE_TYPES, now);
            } else if (taskId != null && TASK_SAME_TYPE_SUPERSEDE_TYPES.contains(type)) {
                notificationRepository.markTaskDeadlineAlertsSuperseded(
                        recipientId, taskId, Set.of(type), now);
            } else if (DIGEST_SUPERSEDE_TYPES.contains(type)) {
                notificationRepository.markDigestSuperseded(recipientId, type, now);
            }
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

    /**
     * The admin used to be exempted here, which made the notification settings screen a no-op for
     * them: toggles saved, the UI showed them off, and every category kept arriving anyway. The
     * admin's preferences live under {@link ErpNotification#ADMIN_RECIPIENT_ID} like any other
     * recipient's, so they are honoured the same way. No stored preference still means "allow".
     */
    private boolean allows(long userId, String type) {
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
