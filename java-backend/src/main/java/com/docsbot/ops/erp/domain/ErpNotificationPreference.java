package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_notification_preferences")
public class ErpNotificationPreference {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "task_assigned_enabled", nullable = false)
    private boolean taskAssignedEnabled = true;

    @Column(name = "manager_message_enabled", nullable = false)
    private boolean managerMessageEnabled = true;

    @Column(name = "employee_help_message_enabled", nullable = false)
    private boolean employeeHelpMessageEnabled = true;

    @Column(name = "completion_updates_enabled", nullable = false)
    private boolean completionUpdatesEnabled = true;

    @Column(name = "deadline_alerts_enabled", nullable = false)
    private boolean deadlineAlertsEnabled = true;

    @Column(name = "browser_push_enabled", nullable = false)
    private boolean browserPushEnabled;

    @Column(name = "mobile_push_enabled", nullable = false)
    private boolean mobilePushEnabled;

    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ErpNotificationPreference() {
    }

    public static ErpNotificationPreference defaults(long userId, Instant now) {
        ErpNotificationPreference preference = new ErpNotificationPreference();
        preference.userId = userId;
        preference.createdAt = now;
        preference.updatedAt = now;
        return preference;
    }

    public boolean allows(String type) {
        return switch (type) {
            case "task_assigned" -> taskAssignedEnabled;
            case "manager_message" -> managerMessageEnabled;
            case "employee_help_message" -> employeeHelpMessageEnabled;
            case "task_completion_requested", "task_completion_approved", "task_completion_rejected" ->
                    completionUpdatesEnabled;
            // Every deadline-driven alert hangs off the one "termin uyarıları" switch — including the
            // admin-only digests and the tender-deadline reminders, which used to fall through to
            // `default -> true` and so could not be turned off at all.
            case "task_due_soon", "task_overdue", "task_overdue_nudge", "manager_due_soon_digest",
                    "manager_overdue_digest", "manager_overdue_escalation", "manager_weekly_digest",
                    "task_blocked_escalation", "task_completion_approval_escalation",
                    "tender_deadline_soon", "tender_deadline_passed",
                    // Combined forms of the same alerts, sent when one scan would otherwise buzz
                    // the same person several times over.
                    "task_due_soon_digest", "task_overdue_digest", "task_overdue_nudge_digest" ->
                    deadlineAlertsEnabled;
            default -> true;
        };
    }

    public void update(
            Boolean taskAssignedEnabled,
            Boolean managerMessageEnabled,
            Boolean employeeHelpMessageEnabled,
            Boolean completionUpdatesEnabled,
            Boolean deadlineAlertsEnabled,
            Boolean browserPushEnabled,
            Boolean mobilePushEnabled,
            Boolean emailEnabled,
            Instant now
    ) {
        if (taskAssignedEnabled != null) {
            this.taskAssignedEnabled = taskAssignedEnabled;
        }
        if (managerMessageEnabled != null) {
            this.managerMessageEnabled = managerMessageEnabled;
        }
        if (employeeHelpMessageEnabled != null) {
            this.employeeHelpMessageEnabled = employeeHelpMessageEnabled;
        }
        if (completionUpdatesEnabled != null) {
            this.completionUpdatesEnabled = completionUpdatesEnabled;
        }
        if (deadlineAlertsEnabled != null) {
            this.deadlineAlertsEnabled = deadlineAlertsEnabled;
        }
        if (browserPushEnabled != null) {
            this.browserPushEnabled = browserPushEnabled;
        }
        if (mobilePushEnabled != null) {
            this.mobilePushEnabled = mobilePushEnabled;
        }
        if (emailEnabled != null) {
            this.emailEnabled = emailEnabled;
        }
        updatedAt = now;
    }

    /**
     * Turns mobile push on because the device just registered a token, which only happens after
     * the user granted the OS notification permission. Returns true if the flag actually changed.
     */
    public boolean enableMobilePush(Instant now) {
        if (mobilePushEnabled) {
            return false;
        }
        mobilePushEnabled = true;
        updatedAt = now;
        return true;
    }

    public Long getUserId() {
        return userId;
    }

    public boolean isTaskAssignedEnabled() {
        return taskAssignedEnabled;
    }

    public boolean isManagerMessageEnabled() {
        return managerMessageEnabled;
    }

    public boolean isEmployeeHelpMessageEnabled() {
        return employeeHelpMessageEnabled;
    }

    public boolean isCompletionUpdatesEnabled() {
        return completionUpdatesEnabled;
    }

    public boolean isDeadlineAlertsEnabled() {
        return deadlineAlertsEnabled;
    }

    public boolean isBrowserPushEnabled() {
        return browserPushEnabled;
    }

    public boolean isMobilePushEnabled() {
        return mobilePushEnabled;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
