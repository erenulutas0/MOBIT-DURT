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
import com.docsbot.ops.erp.application.ErpActivityService;
import com.docsbot.ops.erp.application.ErpAnalyticsService;
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

    public ErpController(
            ErpService erpService,
            NotificationService notificationService,
            ErpAnalyticsService analyticsService,
            ErpActivityService activityService
    ) {
        this.erpService = erpService;
        this.notificationService = notificationService;
        this.analyticsService = analyticsService;
        this.activityService = activityService;
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
                request.priority(),
                request.deadlineAt()));
    }

    @PatchMapping("/tasks/{taskId}")
    ErpDtos.TaskResponse updateTask(
            JwtAuthenticationToken authentication,
            @PathVariable long taskId,
            @Valid @RequestBody UpdateTaskStatusRequest request
    ) {
        return ErpDtos.TaskResponse.from(erpService.updateTaskStatus(
                ErpPrincipal.from(authentication),
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
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        return erpService.listDirectMessages(
                        ErpPrincipal.from(authentication),
                        normalizeLimit(limit))
                .stream()
                .map(ErpDtos.DirectMessageResponse::from)
                .toList();
    }

    @PostMapping("/messages")
    ErpDtos.DirectMessageResponse sendMessage(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody DirectMessageRequest request
    ) {
        return ErpDtos.DirectMessageResponse.from(erpService.sendDirectMessage(
                ErpPrincipal.from(authentication),
                request.recipientUserId(),
                request.body(),
                request.messageKind(),
                request.mediaMimeType(),
                request.mediaData(),
                request.mediaDurationMs()));
    }

    @PatchMapping("/messages/{messageId}/read")
    ErpDtos.DirectMessageResponse readMessage(
            JwtAuthenticationToken authentication,
            @PathVariable long messageId
    ) {
        return ErpDtos.DirectMessageResponse.from(erpService.markDirectMessageRead(
                ErpPrincipal.from(authentication),
                messageId));
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
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt
    ) {
        CreateTaskRequest {
            assigneeUserIds = assigneeUserIds == null ? List.of() : List.copyOf(assigneeUserIds);
            assigneeTeamIds = assigneeTeamIds == null ? List.of() : List.copyOf(assigneeTeamIds);
            priority = priority == null || priority.isBlank() ? "normal" : priority;
        }
    }

    record UpdateTaskStatusRequest(@NotBlank String status) {
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
            @JsonProperty("media_duration_ms") Integer mediaDurationMs
    ) {
    }

    record UnreadNotificationCountResponse(@JsonProperty("unread_count") long unreadCount) {
    }

    record ReadAllNotificationsResponse(@JsonProperty("updated_count") int updatedCount) {
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
