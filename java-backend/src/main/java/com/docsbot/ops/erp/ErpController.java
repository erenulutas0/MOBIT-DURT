package com.docsbot.ops.erp;

import java.time.Instant;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.common.media.MessageMediaStorage;
import com.docsbot.ops.erp.application.AppUpdateService;
import com.docsbot.ops.erp.application.ErpActivityService;
import com.docsbot.ops.erp.application.ErpAnalyticsService;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpService;
import com.docsbot.ops.erp.application.NotificationService;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp")
@Profile("postgres")
public class ErpController {

    private final ErpService erpService;
    private final NotificationService notificationService;
    private final ErpAnalyticsService analyticsService;
    private final ErpActivityService activityService;
    private final AppUpdateService appUpdateService;
    private final MessageMediaStorage mediaStorage;

    public ErpController(
            ErpService erpService,
            NotificationService notificationService,
            ErpAnalyticsService analyticsService,
            ErpActivityService activityService,
            AppUpdateService appUpdateService,
            MessageMediaStorage mediaStorage
    ) {
        this.erpService = erpService;
        this.notificationService = notificationService;
        this.analyticsService = analyticsService;
        this.activityService = activityService;
        this.appUpdateService = appUpdateService;
        this.mediaStorage = mediaStorage;
    }

    @GetMapping("/overview")
    ErpDtos.OverviewResponse overview(JwtAuthenticationToken authentication) {
        return erpService.overview(ErpPrincipal.from(authentication));
    }

    @GetMapping("/analytics/summary")
    ErpDtos.AnalyticsSummaryResponse analyticsSummary(JwtAuthenticationToken authentication) {
        return analyticsService.summary(ErpPrincipal.from(authentication));
    }

    @GetMapping("/activity")
    ErpDtos.ActivityEventPageResponse activity(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        int normalizedOffset = normalizeOffset(offset);
        int normalizedLimit = normalizeLimit(limit);
        var page = activityService.page(
                ErpPrincipal.from(authentication),
                normalizedOffset,
                normalizedLimit);
        return new ErpDtos.ActivityEventPageResponse(
                ErpDtos.PageMeta.of(page.total(), normalizedOffset, normalizedLimit),
                page.items().stream().map(ErpDtos.ActivityEventResponse::from).toList());
    }

    @GetMapping("/app-update")
    AppUpdateResponse appUpdate(
            @RequestParam(name = "current_version", defaultValue = "0.0.0") String currentVersion
    ) {
        return AppUpdateResponse.from(appUpdateService.info(currentVersion));
    }

    @PostMapping("/app-update/broadcast")
    AppUpdateBroadcastResponse broadcastAppUpdate(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody AppUpdateBroadcastRequest request
    ) {
        return AppUpdateBroadcastResponse.from(appUpdateService.broadcast(
                ErpPrincipal.from(authentication),
                request.latestVersion()));
    }

    @GetMapping("/users")
    List<ErpDtos.UserResponse> users(JwtAuthenticationToken authentication) {
        return erpService.listUsers(ErpPrincipal.from(authentication)).stream()
                .map(ErpDtos.UserResponse::from)
                .toList();
    }

    @GetMapping("/users/page")
    ErpDtos.UserPageResponse usersPage(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        int normalizedOffset = normalizeOffset(offset);
        int normalizedLimit = normalizeLimit(limit);
        var page = erpService.pageUsers(
                ErpPrincipal.from(authentication),
                normalizedOffset,
                normalizedLimit);
        return new ErpDtos.UserPageResponse(
                ErpDtos.PageMeta.of(page.total(), normalizedOffset, normalizedLimit),
                page.items().stream().map(ErpDtos.UserResponse::from).toList());
    }

    @PostMapping("/users")
    ErpDtos.UserResponse createUser(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateUserRequest request
    ) {
        return ErpDtos.UserResponse.from(erpService.createUser(
                ErpPrincipal.from(authentication),
                request.name(),
                request.role(),
                request.email(),
                request.phone()));
    }

    @DeleteMapping("/users/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteUser(JwtAuthenticationToken authentication, @PathVariable long userId) {
        erpService.deleteUser(ErpPrincipal.from(authentication), userId);
    }

    @PostMapping("/me/account-deletion-request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void requestAccountDeletion(JwtAuthenticationToken authentication) {
        erpService.requestAccountDeletion(ErpPrincipal.from(authentication));
    }

    /**
     * Admin-issued password reset for a locked-out employee. Returns nothing — resetting someone
     * else's password must never hand the admin a session as that user.
     */
    @PatchMapping("/users/{userId}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resetUserPassword(
            JwtAuthenticationToken authentication,
            @PathVariable long userId,
            @Valid @RequestBody ResetPasswordRequest request
    ) {
        erpService.resetUserPassword(ErpPrincipal.from(authentication), userId, request.password());
    }

    /** Self-service change; requires the current password so a stolen session can't take over. */
    @PatchMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void changeOwnPassword(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        erpService.changeOwnPassword(
                ErpPrincipal.from(authentication),
                request.currentPassword(),
                request.newPassword());
    }

    // Same minimum as registration — a reset must not become a way to weaken an account.
    record ResetPasswordRequest(@NotBlank @Size(min = 10, max = 128) String password) {
    }

    record ChangePasswordRequest(
            @NotBlank @Size(max = 128) @JsonProperty("current_password") String currentPassword,
            @NotBlank @Size(min = 10, max = 128) @JsonProperty("new_password") String newPassword
    ) {
    }

    @PostMapping("/users/{userId}/presence")
    ErpDtos.UserResponse updatePresence(
            JwtAuthenticationToken authentication,
            @PathVariable long userId,
            @Valid @RequestBody PresenceRequest request
    ) {
        return ErpDtos.UserResponse.from(erpService.updatePresence(
                ErpPrincipal.from(authentication),
                userId,
                request.status()));
    }

    /** Admin-only ünvan assignment; blank/absent title clears it. */
    @PatchMapping("/users/{userId}/title")
    ErpDtos.UserResponse updateUserTitle(
            JwtAuthenticationToken authentication,
            @PathVariable long userId,
            @Valid @RequestBody UpdateUserTitleRequest request
    ) {
        return ErpDtos.UserResponse.from(erpService.updateUserTitle(
                ErpPrincipal.from(authentication),
                userId,
                request.title()));
    }

    record UpdateUserTitleRequest(@Size(max = 120) String title) {
    }

    @PatchMapping("/users/{userId}/document-network-visibility")
    ErpDtos.UserResponse updateDocumentNetworkVisibility(
            JwtAuthenticationToken authentication,
            @PathVariable long userId,
            @Valid @RequestBody DocumentNetworkVisibilityRequest request
    ) {
        return ErpDtos.UserResponse.from(erpService.updateDocumentNetworkVisibility(
                ErpPrincipal.from(authentication),
                userId,
                request.visible()));
    }

    @GetMapping("/teams")
    List<ErpDtos.TeamResponse> teams(JwtAuthenticationToken authentication) {
        return erpService.listTeams(ErpPrincipal.from(authentication)).stream()
                .map(ErpDtos.TeamResponse::from)
                .toList();
    }

    @PostMapping("/teams")
    ErpDtos.TeamResponse createTeam(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateTeamRequest request
    ) {
        return ErpDtos.TeamResponse.from(erpService.createTeam(
                ErpPrincipal.from(authentication),
                request.name()));
    }

    @PostMapping("/teams/{teamId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void addTeamMember(
            JwtAuthenticationToken authentication,
            @PathVariable long teamId,
            @PathVariable long userId
    ) {
        erpService.addTeamMember(ErpPrincipal.from(authentication), teamId, userId);
    }

    @DeleteMapping("/teams/{teamId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeTeamMember(
            JwtAuthenticationToken authentication,
            @PathVariable long teamId,
            @PathVariable long userId
    ) {
        erpService.removeTeamMember(ErpPrincipal.from(authentication), teamId, userId);
    }

    @GetMapping("/tasks")
    List<ErpDtos.TaskResponse> tasks(JwtAuthenticationToken authentication) {
        return erpService.listTasks(ErpPrincipal.from(authentication)).stream()
                .map(ErpDtos.TaskResponse::from)
                .toList();
    }

    @GetMapping("/tasks/page")
    ErpDtos.TaskPageResponse tasksPage(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        int normalizedOffset = normalizeOffset(offset);
        int normalizedLimit = normalizeLimit(limit);
        var page = erpService.pageTasks(
                ErpPrincipal.from(authentication),
                normalizedOffset,
                normalizedLimit);
        return new ErpDtos.TaskPageResponse(
                ErpDtos.PageMeta.of(page.total(), normalizedOffset, normalizedLimit),
                page.items().stream().map(ErpDtos.TaskResponse::from).toList());
    }

    @GetMapping("/tasks/{taskId}")
    ErpDtos.TaskResponse task(JwtAuthenticationToken authentication, @PathVariable long taskId) {
        return ErpDtos.TaskResponse.from(erpService.getTask(
                ErpPrincipal.from(authentication),
                taskId));
    }

    @PostMapping("/tasks")
    ErpDtos.TaskResponse createTask(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateTaskRequest request
    ) {
        return ErpDtos.TaskResponse.from(erpService.createTask(
                ErpPrincipal.from(authentication),
                request.title(),
                request.description(),
                request.assigneeUserIds(),
                request.assigneeTeamIds(),
                request.responsibleUserId(),
                request.assigneeTitles(),
                request.priority(),
                request.deadlineAt(),
                request.parentTaskId()));
    }

    @PostMapping("/tasks/{taskId}/dependencies")
    ErpDtos.TaskDependencyResponse addTaskDependency(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody AddTaskDependencyRequest request
    ) {
        if (request.predecessorTaskId() == null) {
            throw new ErpExceptions.BadRequest("predecessor_task_id is required");
        }
        return ErpDtos.TaskDependencyResponse.from(erpService.addTaskDependency(
                ErpPrincipal.from(authentication),
                taskId,
                request.predecessorTaskId()));
    }

    @DeleteMapping("/tasks/{taskId}/dependencies/{predecessorTaskId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeTaskDependency(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @PathVariable long predecessorTaskId
    ) {
        erpService.removeTaskDependency(ErpPrincipal.from(authentication), taskId, predecessorTaskId);
    }

    @PostMapping("/tasks/{taskId}/document-group")
    ErpDtos.TaskResponse linkTaskDocumentGroup(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody LinkTaskDocumentGroupRequest request
    ) {
        if (request.documentGroupId() == null) {
            throw new ErpExceptions.BadRequest("document_group_id is required");
        }
        return ErpDtos.TaskResponse.from(erpService.linkTaskDocumentGroup(
                ErpPrincipal.from(authentication),
                taskId,
                request.documentGroupId()));
    }

    @PatchMapping("/tasks/{taskId}")
    ErpDtos.TaskResponse updateTask(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody UpdateTaskRequest request
    ) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        if (request.hasEditFields()) {
            return ErpDtos.TaskResponse.from(erpService.updateTaskDetails(
                    principal,
                    taskId,
                    request.title(),
                    request.description(),
                    request.priority(),
                    request.deadlineAt(),
                    Boolean.TRUE.equals(request.clearDeadline()),
                    request.status()));
        }
        if (request.status() == null || request.status().isBlank()) {
            throw new ErpExceptions.BadRequest("No task fields to update");
        }
        return ErpDtos.TaskResponse.from(erpService.updateTaskStatus(
                principal,
                taskId,
                request.status()));
    }

    @PatchMapping("/tasks/bulk/status")
    List<ErpDtos.TaskResponse> bulkUpdateTaskStatus(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody BulkTaskStatusRequest request
    ) {
        return erpService.bulkUpdateTaskStatus(
                        ErpPrincipal.from(authentication),
                        request.taskIds(),
                        request.status())
                .stream()
                .map(ErpDtos.TaskResponse::from)
                .toList();
    }

    @PostMapping("/tasks/bulk/assignees")
    List<ErpDtos.TaskResponse> bulkAddTaskAssignees(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody BulkTaskAssigneesRequest request
    ) {
        return erpService.bulkAddTaskAssignees(
                        ErpPrincipal.from(authentication),
                        request.taskIds(),
                        request.assigneeUserIds(),
                        request.assigneeTeamIds())
                .stream()
                .map(ErpDtos.TaskResponse::from)
                .toList();
    }

    @PostMapping("/tasks/{taskId}/completion-request")
    ErpDtos.TaskResponse requestCompletion(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody CompletionRequest request
    ) {
        return ErpDtos.TaskResponse.from(erpService.requestTaskCompletion(
                ErpPrincipal.from(authentication),
                taskId,
                request.note()));
    }

    @PostMapping("/tasks/{taskId}/approve-completion")
    ErpDtos.TaskResponse approveCompletion(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId
    ) {
        return ErpDtos.TaskResponse.from(erpService.approveTaskCompletion(
                ErpPrincipal.from(authentication),
                taskId));
    }

    @PostMapping("/tasks/{taskId}/reject-completion")
    ErpDtos.TaskResponse rejectCompletion(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody CompletionDecisionRequest request
    ) {
        return ErpDtos.TaskResponse.from(erpService.rejectTaskCompletion(
                ErpPrincipal.from(authentication),
                taskId,
                request.note()));
    }

    @PostMapping("/tasks/{taskId}/comments")
    ErpDtos.TaskCommentResponse addComment(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody TaskCommentRequest request
    ) {
        return ErpDtos.TaskCommentResponse.from(erpService.createTaskComment(
                ErpPrincipal.from(authentication),
                taskId,
                request.body(),
                request.kind()));
    }

    @GetMapping("/messages")
    List<ErpDtos.DirectMessageResponse> messages(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "before_id", required = false) Long beforeId
    ) {
        return erpService.listDirectMessages(
                        ErpPrincipal.from(authentication),
                        normalizeLimit(limit),
                        beforeId)
                .stream()
                .map(this::directMessageResponse)
                .toList();
    }

    @GetMapping(value = "/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter directMessageStream(JwtAuthenticationToken authentication) {
        return erpService.streamDirectMessages(ErpPrincipal.from(authentication));
    }

    @PostMapping("/messages")
    ErpDtos.DirectMessageResponse sendMessage(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody DirectMessageRequest request
    ) {
        return directMessageResponse(erpService.sendDirectMessage(
                ErpPrincipal.from(authentication),
                request.recipientUserId(),
                request.body(),
                request.messageKind(),
                request.mediaMimeType(),
                request.mediaData(),
                request.mediaDurationMs(),
                request.clientMessageId(),
                request.replyToMessageId()));
    }

    @PatchMapping("/messages/{messageId}/read")
    ErpDtos.DirectMessageResponse readMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long messageId
    ) {
        return directMessageResponse(erpService.markDirectMessageRead(
                ErpPrincipal.from(authentication),
                messageId));
    }

    @GetMapping("/messages/{messageId}/media")
    ResponseEntity<Resource> messageMedia(
            JwtAuthenticationToken authentication,
            @PathVariable long messageId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        MessageMediaStorage.StoredContent media = erpService.readDirectMessageMedia(
                ErpPrincipal.from(authentication),
                messageId);
        // Only render known-safe types inline; anything else (attacker-chosen content type on a
        // chat message) is forced to attachment so it can't execute on the API origin.
        boolean inline = !download && MessageMediaStorage.isInlineSafe(media.contentType());
        ContentDisposition disposition = (inline
                ? ContentDisposition.inline()
                : ContentDisposition.attachment())
                .filename(media.filename())
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(media.path()));
    }

    private ErpDtos.DirectMessageResponse directMessageResponse(com.docsbot.ops.erp.domain.ErpDirectMessage message) {
        String mediaRef = mediaStorage.reference(message.getMediaData());
        return ErpDtos.DirectMessageResponse.from(
                message,
                mediaRef == null ? mediaStorage.toDataUrl(message.getMediaData(), message.getMediaMimeType()) : null,
                mediaRef == null ? null : "/erp/messages/" + message.getId() + "/media",
                mediaRef);
    }

    @DeleteMapping("/messages/{messageId}")
    ResponseEntity<Void> deleteMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long messageId,
            @RequestParam(name = "scope", required = false) String scope
    ) {
        erpService.deleteDirectMessage(ErpPrincipal.from(authentication), messageId, scope);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/notifications")
    List<ErpDtos.NotificationResponse> notifications(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "user_id", required = false) Long ignoredUserId
    ) {
        return notificationService.listNotifications(ErpPrincipal.from(authentication)).stream()
                .map(ErpDtos.NotificationResponse::from)
                .toList();
    }

    @GetMapping("/notifications/unread-count")
    UnreadNotificationCountResponse unreadNotifications(JwtAuthenticationToken authentication) {
        return new UnreadNotificationCountResponse(
                notificationService.unreadCount(ErpPrincipal.from(authentication)));
    }

    @GetMapping(value = "/notifications/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter notificationStream(JwtAuthenticationToken authentication) {
        return notificationService.stream(ErpPrincipal.from(authentication));
    }

    @PatchMapping("/notifications/{notificationId}/read")
    ErpDtos.NotificationResponse readNotification(
            JwtAuthenticationToken authentication,
            @PathVariable long notificationId
    ) {
        return ErpDtos.NotificationResponse.from(notificationService.markRead(
                ErpPrincipal.from(authentication),
                notificationId));
    }

    @PatchMapping("/notifications/read-all")
    ReadAllNotificationsResponse readAllNotifications(JwtAuthenticationToken authentication) {
        return new ReadAllNotificationsResponse(
                notificationService.markAllRead(ErpPrincipal.from(authentication)));
    }

    @GetMapping("/notification-preferences")
    ErpDtos.NotificationPreferenceResponse notificationPreferences(JwtAuthenticationToken authentication) {
        return ErpDtos.NotificationPreferenceResponse.from(
                notificationService.preferences(ErpPrincipal.from(authentication)));
    }

    @PatchMapping("/notification-preferences")
    ErpDtos.NotificationPreferenceResponse updateNotificationPreferences(
            JwtAuthenticationToken authentication,
            @RequestBody NotificationPreferenceRequest request
    ) {
        return ErpDtos.NotificationPreferenceResponse.from(notificationService.updatePreferences(
                ErpPrincipal.from(authentication),
                request.taskAssignedEnabled(),
                request.managerMessageEnabled(),
                request.employeeHelpMessageEnabled(),
                request.completionUpdatesEnabled(),
                request.deadlineAlertsEnabled(),
                request.browserPushEnabled(),
                request.mobilePushEnabled(),
                request.emailEnabled()));
    }

    @GetMapping("/tasks/{taskId}/documents")
    List<ErpDtos.TaskDocumentResponse> taskDocuments(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId
    ) {
        return erpService.listTaskDocuments(ErpPrincipal.from(authentication), taskId).stream()
                .map(ErpDtos.TaskDocumentResponse::from)
                .toList();
    }

    @PostMapping(
            value = "/tasks/{taskId}/documents",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ErpDtos.TaskDocumentResponse uploadTaskDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @RequestPart("file") MultipartFile file
    ) {
        return ErpDtos.TaskDocumentResponse.from(erpService.uploadTaskDocument(
                ErpPrincipal.from(authentication),
                taskId,
                file));
    }

    @GetMapping("/task-documents/{documentId}/content")
    ResponseEntity<Resource> taskDocumentContent(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        ErpService.TaskDocumentDownload result = erpService.readTaskDocument(
                ErpPrincipal.from(authentication),
                documentId);
        String filename = result.document().getOriginalFilename();
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(filename == null ? "document" : filename)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(result.stored().contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(new FileSystemResource(result.stored().path()));
    }

    @DeleteMapping("/task-documents/{documentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteTaskDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId
    ) {
        erpService.deleteTaskDocument(ErpPrincipal.from(authentication), documentId);
    }

    record CreateUserRequest(
            @NotBlank @Size(min = 2, max = 255) String name,
            @NotBlank String role,
            @Email @Size(max = 255) String email,
            @Size(max = 64) String phone
    ) {
    }

    record PresenceRequest(@NotBlank String status) {
    }

    record DocumentNetworkVisibilityRequest(boolean visible) {
    }

    record CreateTeamRequest(@NotBlank @Size(min = 2, max = 255) String name) {
    }

    record CreateTaskRequest(
            @NotBlank @Size(min = 3, max = 255) String title,
            @Size(max = 10_000) String description,
            @JsonProperty("assignee_user_ids") List<Long> assigneeUserIds,
            @JsonProperty("assignee_team_ids") List<Long> assigneeTeamIds,
            @JsonProperty("responsible_user_id") Long responsibleUserId,
            @JsonProperty("assignee_titles") java.util.Map<Long, String> assigneeTitles,
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt,
            @JsonProperty("parent_task_id") Long parentTaskId
    ) {
        CreateTaskRequest {
            assigneeUserIds = assigneeUserIds == null ? List.of() : List.copyOf(assigneeUserIds);
            assigneeTeamIds = assigneeTeamIds == null ? List.of() : List.copyOf(assigneeTeamIds);
            assigneeTitles = assigneeTitles == null ? java.util.Map.of() : java.util.Map.copyOf(assigneeTitles);
            priority = priority == null || priority.isBlank() ? "normal" : priority;
        }
    }

    record AddTaskDependencyRequest(
            @JsonProperty("predecessor_task_id") Long predecessorTaskId
    ) {
    }

    record LinkTaskDocumentGroupRequest(
            @JsonProperty("document_group_id") Long documentGroupId
    ) {
    }

    record UpdateTaskRequest(
            String status,
            @Size(min = 3, max = 255) String title,
            @Size(max = 10_000) String description,
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt,
            @JsonProperty("clear_deadline") Boolean clearDeadline
    ) {
        boolean hasEditFields() {
            return title != null
                    || description != null
                    || priority != null
                    || deadlineAt != null
                    || Boolean.TRUE.equals(clearDeadline);
        }
    }

    record BulkTaskStatusRequest(
            @JsonProperty("task_ids") @NotEmpty List<Long> taskIds,
            @NotBlank String status
    ) {
        BulkTaskStatusRequest {
            taskIds = taskIds == null ? List.of() : List.copyOf(taskIds);
        }
    }

    record BulkTaskAssigneesRequest(
            @JsonProperty("task_ids") @NotEmpty List<Long> taskIds,
            @JsonProperty("assignee_user_ids") List<Long> assigneeUserIds,
            @JsonProperty("assignee_team_ids") List<Long> assigneeTeamIds
    ) {
        BulkTaskAssigneesRequest {
            taskIds = taskIds == null ? List.of() : List.copyOf(taskIds);
            assigneeUserIds = assigneeUserIds == null ? List.of() : List.copyOf(assigneeUserIds);
            assigneeTeamIds = assigneeTeamIds == null ? List.of() : List.copyOf(assigneeTeamIds);
        }
    }

    record CompletionRequest(
            @JsonProperty("user_id") Long ignoredUserId,
            @Size(max = 4_000) String note
    ) {
    }

    record CompletionDecisionRequest(
            @JsonProperty("admin_name") String ignoredAdminName,
            @Size(max = 4_000) String note
    ) {
    }

    record TaskCommentRequest(
            @JsonProperty("author_user_id") Long ignoredAuthorUserId,
            @NotBlank @Size(min = 2, max = 4_000) String body,
            String kind
    ) {
        TaskCommentRequest {
            kind = kind == null || kind.isBlank() ? "message" : kind;
        }
    }

    record DirectMessageRequest(
            @JsonProperty("recipient_user_id") Long recipientUserId,
            @Size(max = 4_000) String body,
            @JsonProperty("message_kind") String messageKind,
            @JsonProperty("media_mime_type") String mediaMimeType,
            @JsonProperty("media_data") String mediaData,
            @JsonProperty("media_duration_ms") Integer mediaDurationMs,
            @JsonProperty("client_message_id") String clientMessageId,
            @JsonProperty("reply_to_message_id") Long replyToMessageId
    ) {
    }

    record UnreadNotificationCountResponse(@JsonProperty("unread_count") long unreadCount) {
    }

    record ReadAllNotificationsResponse(@JsonProperty("updated_count") int updatedCount) {
    }

    record AppUpdateResponse(
            @JsonProperty("current_version") String currentVersion,
            @JsonProperty("latest_version") String latestVersion,
            @JsonProperty("minimum_version") String minimumVersion,
            @JsonProperty("update_available") boolean updateAvailable,
            boolean required,
            String title,
            String message,
            @JsonProperty("play_store_url") String playStoreUrl
    ) {
        static AppUpdateResponse from(AppUpdateService.AppUpdateInfo value) {
            return new AppUpdateResponse(
                    value.currentVersion(),
                    value.latestVersion(),
                    value.minimumVersion(),
                    value.updateAvailable(),
                    value.required(),
                    value.title(),
                    value.message(),
                    value.playStoreUrl());
        }
    }

    record AppUpdateBroadcastRequest(
            @JsonProperty("latest_version") @Size(max = 64) String latestVersion
    ) {
    }

    record AppUpdateBroadcastResponse(
            @JsonProperty("latest_version") String latestVersion,
            @JsonProperty("active_device_users") int activeDeviceUsers,
            @JsonProperty("notifications_created") int notificationsCreated
    ) {
        static AppUpdateBroadcastResponse from(AppUpdateService.AppUpdateBroadcastResult value) {
            return new AppUpdateBroadcastResponse(
                    value.latestVersion(),
                    value.activeDeviceUsers(),
                    value.notificationsCreated());
        }
    }

    record NotificationPreferenceRequest(
            @JsonProperty("task_assigned_enabled") Boolean taskAssignedEnabled,
            @JsonProperty("manager_message_enabled") Boolean managerMessageEnabled,
            @JsonProperty("employee_help_message_enabled") Boolean employeeHelpMessageEnabled,
            @JsonProperty("completion_updates_enabled") Boolean completionUpdatesEnabled,
            @JsonProperty("deadline_alerts_enabled") Boolean deadlineAlertsEnabled,
            @JsonProperty("browser_push_enabled") Boolean browserPushEnabled,
            @JsonProperty("mobile_push_enabled") Boolean mobilePushEnabled,
            @JsonProperty("email_enabled") Boolean emailEnabled
    ) {
    }

    private int normalizeOffset(int offset) {
        return Math.max(0, offset);
    }

    private int normalizeLimit(int limit) {
        return Math.max(1, Math.min(limit, 100));
    }
}
