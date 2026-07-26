package com.docsbot.ops.erp;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.domain.UserStatus;
import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.domain.ErpCompanyChatMessage;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationPreference;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.ErpTaskComment;
import com.docsbot.ops.erp.domain.ErpTaskDocument;
import com.docsbot.ops.erp.domain.ErpTeam;
import com.fasterxml.jackson.annotation.JsonProperty;

public final class ErpDtos {

    private ErpDtos() {
    }

    public record UserResponse(
            Long id,
            String name,
            String role,
            String status,
            String email,
            String phone,
            String title,
            @JsonProperty("document_network_visible") boolean documentNetworkVisible,
            @JsonProperty("last_seen_at") Instant lastSeenAt,
            @JsonProperty("approved_at") Instant approvedAt,
            @JsonProperty("created_at") Instant createdAt
    ) {
        /**
         * ONLINE decays to OFFLINE for display once the last heartbeat is older than this. Clients
         * send presence on app open/close, but a killed app or dead battery never says goodbye —
         * without the decay everyone looks online forever.
         */
        private static final Duration ONLINE_STALE_AFTER = Duration.ofMinutes(5);

        private static UserStatus effectiveStatus(ErpUser user) {
            UserStatus status = user.getStatus();
            if (status != UserStatus.ONLINE) {
                return status;
            }
            Instant lastSeen = user.getLastSeenAt();
            boolean stale = lastSeen == null
                    || lastSeen.isBefore(Instant.now().minus(ONLINE_STALE_AFTER));
            return stale ? UserStatus.OFFLINE : UserStatus.ONLINE;
        }

        public static UserResponse from(ErpUser user) {
            return new UserResponse(
                    user.getId(),
                    user.getName(),
                    user.getRole().name().toLowerCase(Locale.ROOT),
                    effectiveStatus(user).name().toLowerCase(Locale.ROOT),
                    user.getEmail(),
                    user.getPhone(),
                    user.getTitle(),
                    user.isDocumentNetworkVisible(),
                    user.getLastSeenAt(),
                    user.getApprovedAt(),
                    user.getCreatedAt());
        }
    }

    public record TeamResponse(
            Long id,
            String name,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static TeamResponse from(ErpTeam team) {
            return new TeamResponse(team.getId(), team.getName(), team.getCreatedAt());
        }
    }

    public record TaskResponse(
            Long id,
            String title,
            String description,
            @JsonProperty("assigned_by_user_id") Long assignedByUserId,
            String status,
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt,
            @JsonProperty("schedule_kind") String scheduleKind,
            @JsonProperty("starts_at") Instant startsAt,
            @JsonProperty("completed_at") Instant completedAt,
            @JsonProperty("workflow_template_id") Long workflowTemplateId,
            @JsonProperty("scheduled_for") Instant scheduledFor,
            @JsonProperty("parent_task_id") Long parentTaskId,
            @JsonProperty("document_group_id") Long documentGroupId,
            @JsonProperty("created_at") Instant createdAt,
            long version
    ) {
        public static TaskResponse from(ErpTask task) {
            return new TaskResponse(
                    task.getId(),
                    task.getTitle(),
                    task.getDescription(),
                    task.getAssignedByUserId(),
                    task.getStatus().name().toLowerCase(Locale.ROOT),
                    task.getPriority().name().toLowerCase(Locale.ROOT),
                    task.getDeadlineAt(),
                    task.getScheduleKind().name().toLowerCase(Locale.ROOT),
                    task.getStartsAt(),
                    task.getCompletedAt(),
                    task.getWorkflowTemplateId(),
                    task.getScheduledFor(),
                    task.getParentTaskId(),
                    task.getDocumentGroupId(),
                    task.getCreatedAt(),
                    task.getVersion());
        }
    }

    public record TaskDependencyResponse(
            Long id,
            @JsonProperty("predecessor_task_id") Long predecessorTaskId,
            @JsonProperty("successor_task_id") Long successorTaskId,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static TaskDependencyResponse from(com.docsbot.ops.erp.domain.ErpTaskDependency dependency) {
            return new TaskDependencyResponse(
                    dependency.getId(),
                    dependency.getPredecessorTaskId(),
                    dependency.getSuccessorTaskId(),
                    dependency.getCreatedAt());
        }
    }

    public record AssignmentResponse(
            Long id,
            @JsonProperty("task_id") Long taskId,
            @JsonProperty("assignee_user_id") Long assigneeUserId,
            @JsonProperty("assignee_team_id") Long assigneeTeamId,
            String role,
            String title,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static AssignmentResponse from(ErpTaskAssignment assignment) {
            return new AssignmentResponse(
                    assignment.getId(),
                    assignment.getTaskId(),
                    assignment.getAssigneeUserId(),
                    assignment.getAssigneeTeamId(),
                    assignment.getRole(),
                    assignment.getTitle(),
                    assignment.getCreatedAt());
        }
    }

    public record TaskCommentResponse(
            Long id,
            @JsonProperty("task_id") Long taskId,
            @JsonProperty("author_user_id") Long authorUserId,
            String body,
            String kind,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static TaskCommentResponse from(ErpTaskComment comment) {
            return new TaskCommentResponse(
                    comment.getId(),
                    comment.getTaskId(),
                    comment.getAuthorUserId(),
                    comment.getBody(),
                    comment.getKind(),
                    comment.getCreatedAt());
        }
    }

    public record DirectMessageResponse(
            Long id,
            @JsonProperty("sender_type") String senderType,
            @JsonProperty("sender_user_id") Long senderUserId,
            @JsonProperty("sender_name") String senderName,
            @JsonProperty("recipient_type") String recipientType,
            @JsonProperty("recipient_user_id") Long recipientUserId,
            @JsonProperty("recipient_name") String recipientName,
            String body,
            @JsonProperty("message_kind") String messageKind,
            @JsonProperty("media_mime_type") String mediaMimeType,
            @JsonProperty("media_data") String mediaData,
            @JsonProperty("media_url") String mediaUrl,
            @JsonProperty("media_ref") String mediaRef,
            @JsonProperty("media_duration_ms") Integer mediaDurationMs,
            @JsonProperty("client_message_id") String clientMessageId,
            @JsonProperty("reply_to_message_id") Long replyToMessageId,
            @JsonProperty("delivered_at") Instant deliveredAt,
            @JsonProperty("read_at") Instant readAt,
            @JsonProperty("delivery_status") String deliveryStatus,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static DirectMessageResponse from(ErpDirectMessage message) {
            return from(message, message.getMediaData(), null, null);
        }

        public static DirectMessageResponse from(ErpDirectMessage message, String mediaData) {
            return from(message, mediaData, null, null);
        }

        public static DirectMessageResponse from(
                ErpDirectMessage message,
                String mediaData,
                String mediaUrl,
                String mediaRef
        ) {
            return new DirectMessageResponse(
                    message.getId(),
                    message.getSenderType(),
                    message.getSenderUserId(),
                    message.getSenderName(),
                    message.getRecipientType(),
                    message.getRecipientUserId(),
                    message.getRecipientName(),
                    message.getBody(),
                    message.getMessageKind(),
                    message.getMediaMimeType(),
                    mediaData,
                    mediaUrl,
                    mediaRef,
                    message.getMediaDurationMs(),
                    message.getClientMessageId(),
                    message.getReplyToMessageId(),
                    message.getDeliveredAt(),
                    message.getReadAt(),
                    message.getReadAt() != null ? "read" : message.getDeliveredAt() != null ? "delivered" : "sent",
                    message.getCreatedAt());
        }
    }

    public record TaskDocumentResponse(
            Long id,
            @JsonProperty("task_id") Long taskId,
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("original_filename") String originalFilename,
            @JsonProperty("file_path") String filePath,
            String visibility,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static TaskDocumentResponse from(ErpTaskDocument document) {
            return new TaskDocumentResponse(
                    document.getId(),
                    document.getTaskId(),
                    document.getDocumentId(),
                    document.getOriginalFilename(),
                    document.getFilePath(),
                    document.getVisibility(),
                    document.getCreatedAt());
        }
    }

    public record CompanyChatMessageResponse(
            Long id,
            @JsonProperty("author_user_id") Long authorUserId,
            @JsonProperty("author_name") String authorName,
            @JsonProperty("author_role") String authorRole,
            String body,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static CompanyChatMessageResponse from(ErpCompanyChatMessage message) {
            return new CompanyChatMessageResponse(
                    message.getId(),
                    message.getAuthorUserId(),
                    message.getAuthorName(),
                    message.getAuthorRole(),
                    message.getBody(),
                    message.getCreatedAt());
        }
    }

    public record NotificationResponse(
            Long id,
            @JsonProperty("user_id") Long userId,
            String type,
            String title,
            String body,
            @JsonProperty("task_id") Long taskId,
            String priority,
            @JsonProperty("event_key") String eventKey,
            @JsonProperty("read_at") Instant readAt,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static NotificationResponse from(ErpNotification notification) {
            return new NotificationResponse(
                    notification.getId(),
                    notification.getUserId(),
                    notification.getType(),
                    notification.getTitle(),
                    notification.getBody(),
                    notification.getTaskId(),
                    notification.getPriority(),
                    notification.getEventKey(),
                    notification.getReadAt(),
                    notification.getCreatedAt());
        }
    }

    public record NotificationPreferenceResponse(
            @JsonProperty("user_id") Long userId,
            @JsonProperty("task_assigned_enabled") boolean taskAssignedEnabled,
            @JsonProperty("manager_message_enabled") boolean managerMessageEnabled,
            @JsonProperty("employee_help_message_enabled") boolean employeeHelpMessageEnabled,
            @JsonProperty("completion_updates_enabled") boolean completionUpdatesEnabled,
            @JsonProperty("deadline_alerts_enabled") boolean deadlineAlertsEnabled,
            @JsonProperty("browser_push_enabled") boolean browserPushEnabled,
            @JsonProperty("mobile_push_enabled") boolean mobilePushEnabled,
            @JsonProperty("email_enabled") boolean emailEnabled,
            @JsonProperty("updated_at") Instant updatedAt
    ) {
        public static NotificationPreferenceResponse from(ErpNotificationPreference preference) {
            return new NotificationPreferenceResponse(
                    preference.getUserId(),
                    preference.isTaskAssignedEnabled(),
                    preference.isManagerMessageEnabled(),
                    preference.isEmployeeHelpMessageEnabled(),
                    preference.isCompletionUpdatesEnabled(),
                    preference.isDeadlineAlertsEnabled(),
                    preference.isBrowserPushEnabled(),
                    preference.isMobilePushEnabled(),
                    preference.isEmailEnabled(),
                    preference.getUpdatedAt());
        }
    }

    public record OverviewResponse(
            List<UserResponse> users,
            List<TeamResponse> teams,
            List<TaskResponse> tasks,
            List<AssignmentResponse> assignments,
            List<TaskDocumentResponse> documents,
            @JsonProperty("help_messages") List<TaskCommentResponse> helpMessages,
            List<NotificationResponse> notifications,
            @JsonProperty("task_dependencies") List<TaskDependencyResponse> taskDependencies
    ) {
    }

    public record PageMeta(
            long total,
            int offset,
            int limit,
            @JsonProperty("has_next") boolean hasNext
    ) {
        public static PageMeta of(long total, int offset, int limit) {
            return new PageMeta(total, offset, limit, offset + limit < total);
        }
    }

    public record UserPageResponse(
            PageMeta page,
            List<UserResponse> items
    ) {
    }

    public record TaskPageResponse(
            PageMeta page,
            List<TaskResponse> items
    ) {
    }

    public record ActivityEventResponse(
            Long id,
            @JsonProperty("actor_type") String actorType,
            @JsonProperty("actor_user_id") Long actorUserId,
            @JsonProperty("actor_name") String actorName,
            @JsonProperty("event_type") String eventType,
            @JsonProperty("subject_type") String subjectType,
            @JsonProperty("subject_id") String subjectId,
            @JsonProperty("task_id") Long taskId,
            String details,
            @JsonProperty("created_at") Instant createdAt
    ) {
        public static ActivityEventResponse from(ErpActivityEvent event) {
            return new ActivityEventResponse(
                    event.getId(),
                    event.getActorType(),
                    event.getActorUserId(),
                    event.getActorName(),
                    event.getEventType(),
                    event.getSubjectType(),
                    event.getSubjectId(),
                    event.getTaskId(),
                    event.getDetails(),
                    event.getCreatedAt());
        }
    }

    public record ActivityEventPageResponse(
            PageMeta page,
            List<ActivityEventResponse> items
    ) {
    }

    public record AnalyticsSummaryResponse(
            @JsonProperty("generated_at") Instant generatedAt,
            @JsonProperty("users_total") long usersTotal,
            @JsonProperty("active_users") long activeUsers,
            @JsonProperty("teams_total") long teamsTotal,
            @JsonProperty("tasks_total") long tasksTotal,
            @JsonProperty("tasks_by_status") List<MetricCount> tasksByStatus,
            @JsonProperty("tasks_by_priority") List<MetricCount> tasksByPriority,
            @JsonProperty("overdue_tasks") long overdueTasks,
            @JsonProperty("due_soon_7d_tasks") long dueSoon7dTasks,
            @JsonProperty("blocked_tasks") long blockedTasks,
            @JsonProperty("pending_approval_tasks") long pendingApprovalTasks,
            @JsonProperty("unassigned_tasks") long unassignedTasks,
            @JsonProperty("task_documents_total") long taskDocumentsTotal,
            @JsonProperty("unread_notifications_total") long unreadNotificationsTotal,
            @JsonProperty("completion_rate") double completionRate
    ) {
    }

    public record MetricCount(
            String key,
            long count
    ) {
    }
}
