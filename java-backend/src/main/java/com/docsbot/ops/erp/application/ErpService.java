package com.docsbot.ops.erp.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.common.media.MessageMediaStorage;
import com.docsbot.ops.erp.ErpDtos;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskComment;
import com.docsbot.ops.erp.domain.ErpTaskDocument;
import com.docsbot.ops.erp.domain.ErpTeam;

@Service
@Profile("postgres")
public class ErpService {
    private final ErpOverviewService overviewService;
    private final ErpUserService userService;
    private final ErpTeamService teamService;
    private final ErpTaskWorkflowService taskService;
    private final ErpTaskCommentService commentService;
    private final ErpTaskDocumentService documentService;
    private final ErpDirectMessageService directMessageService;

    public ErpService(
            ErpOverviewService overviewService,
            ErpUserService userService,
            ErpTeamService teamService,
            ErpTaskWorkflowService taskService,
            ErpTaskCommentService commentService,
            ErpTaskDocumentService documentService,
            ErpDirectMessageService directMessageService
    ) {
        this.overviewService = overviewService;
        this.userService = userService;
        this.teamService = teamService;
        this.taskService = taskService;
        this.commentService = commentService;
        this.documentService = documentService;
        this.directMessageService = directMessageService;
    }

    public ErpDtos.OverviewResponse overview(ErpPrincipal principal) {
        return overviewService.overview(principal);
    }

    public List<ErpUser> listUsers(ErpPrincipal principal) {
        return userService.listUsers(principal);
    }

    public PageResult<ErpUser> pageUsers(ErpPrincipal principal, int offset, int limit) {
        return userService.pageUsers(principal, offset, limit);
    }

    public ErpUser createUser(ErpPrincipal principal, String name, String role, String email, String phone) {
        return userService.createUser(principal, name, role, email, phone);
    }

    public void deleteUser(ErpPrincipal principal, long userId) {
        userService.deleteUser(principal, userId);
    }

    public void requestAccountDeletion(ErpPrincipal principal) {
        userService.requestAccountDeletion(principal);
    }

    public ErpUser updatePresence(ErpPrincipal principal, long userId, String status) {
        return userService.updatePresence(principal, userId, status);
    }

    public ErpUser updateDocumentNetworkVisibility(ErpPrincipal principal, long userId, boolean visible) {
        return userService.updateDocumentNetworkVisibility(principal, userId, visible);
    }

    public List<ErpTeam> listTeams(ErpPrincipal principal) {
        return teamService.listTeams(principal);
    }

    public ErpTeam createTeam(ErpPrincipal principal, String name) {
        return teamService.createTeam(principal, name);
    }

    public void addTeamMember(ErpPrincipal principal, long teamId, long userId) {
        teamService.addTeamMember(principal, teamId, userId);
    }

    public void removeTeamMember(ErpPrincipal principal, long teamId, long userId) {
        teamService.removeTeamMember(principal, teamId, userId);
    }

    public List<ErpTask> listTasks(ErpPrincipal principal) {
        return taskService.listTasks(principal);
    }

    public PageResult<ErpTask> pageTasks(ErpPrincipal principal, int offset, int limit) {
        return taskService.pageTasks(principal, offset, limit);
    }

    public ErpTask getTask(ErpPrincipal principal, long taskId) {
        return taskService.getTask(principal, taskId);
    }

    public ErpTask createTask(
            ErpPrincipal principal,
            String title,
            String description,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds,
            Long responsibleUserId,
            java.util.Map<Long, String> assigneeTitles,
            String priority,
            Instant deadlineAt,
            Long parentTaskId
    ) {
        return taskService.createTask(
                principal,
                title,
                description,
                assigneeUserIds,
                assigneeTeamIds,
                responsibleUserId,
                assigneeTitles,
                priority,
                deadlineAt,
                parentTaskId);
    }

    public com.docsbot.ops.erp.domain.ErpTaskDependency addTaskDependency(
            ErpPrincipal principal,
            long successorTaskId,
            long predecessorTaskId
    ) {
        return taskService.addTaskDependency(principal, successorTaskId, predecessorTaskId);
    }

    public ErpTask linkTaskDocumentGroup(ErpPrincipal principal, long taskId, long documentGroupId) {
        return taskService.linkTaskDocumentGroup(principal, taskId, documentGroupId);
    }

    public void removeTaskDependency(ErpPrincipal principal, long successorTaskId, long predecessorTaskId) {
        taskService.removeTaskDependency(principal, successorTaskId, predecessorTaskId);
    }

    public ErpTask updateTaskStatus(ErpPrincipal principal, long taskId, String status) {
        return taskService.updateTaskStatus(principal, taskId, status);
    }

    public ErpTask updateTaskDetails(
            ErpPrincipal principal,
            long taskId,
            String title,
            String description,
            String priority,
            Instant deadlineAt,
            boolean clearDeadline,
            String status
    ) {
        return taskService.updateTaskDetails(
                principal,
                taskId,
                title,
                description,
                priority,
                deadlineAt,
                clearDeadline,
                status);
    }

    public List<ErpTask> bulkUpdateTaskStatus(ErpPrincipal principal, Collection<Long> taskIds, String status) {
        return taskService.bulkUpdateTaskStatus(principal, taskIds, status);
    }

    public List<ErpTask> bulkAddTaskAssignees(
            ErpPrincipal principal,
            Collection<Long> taskIds,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds
    ) {
        return taskService.bulkAddTaskAssignees(principal, taskIds, assigneeUserIds, assigneeTeamIds);
    }

    public ErpTask requestTaskCompletion(ErpPrincipal principal, long taskId, String note) {
        return taskService.requestTaskCompletion(principal, taskId, note);
    }

    public ErpTask approveTaskCompletion(ErpPrincipal principal, long taskId) {
        return taskService.approveTaskCompletion(principal, taskId);
    }

    public ErpTask rejectTaskCompletion(ErpPrincipal principal, long taskId, String note) {
        return taskService.rejectTaskCompletion(principal, taskId, note);
    }

    public ErpTaskComment createTaskComment(
            ErpPrincipal principal,
            long taskId,
            String body,
            String requestedKind
    ) {
        return commentService.createTaskComment(principal, taskId, body, requestedKind);
    }

    public List<ErpDirectMessage> listDirectMessages(ErpPrincipal principal, int limit) {
        return directMessageService.listMessages(principal, limit);
    }

    public List<ErpDirectMessage> listDirectMessages(ErpPrincipal principal, int limit, Long beforeId) {
        return directMessageService.listMessages(principal, limit, beforeId);
    }

    public SseEmitter streamDirectMessages(ErpPrincipal principal) {
        return directMessageService.stream(principal);
    }

    public ErpDirectMessage sendDirectMessage(
            ErpPrincipal principal,
            Long recipientUserId,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs,
            String clientMessageId,
            Long replyToMessageId
    ) {
        return directMessageService.sendMessage(
                principal,
                recipientUserId,
                body,
                messageKind,
                mediaMimeType,
                mediaData,
                mediaDurationMs,
                clientMessageId,
                replyToMessageId);
    }

    public ErpDirectMessage markDirectMessageRead(ErpPrincipal principal, long messageId) {
        return directMessageService.markRead(principal, messageId);
    }

    public void deleteDirectMessage(ErpPrincipal principal, long messageId, String scope) {
        directMessageService.deleteMessage(principal, messageId, scope);
    }

    public MessageMediaStorage.StoredContent readDirectMessageMedia(ErpPrincipal principal, long messageId) {
        return directMessageService.readMessageMedia(principal, messageId);
    }

    public List<ErpTaskDocument> listTaskDocuments(ErpPrincipal principal, long taskId) {
        return documentService.listTaskDocuments(principal, taskId);
    }

    public ErpTaskDocument uploadTaskDocument(ErpPrincipal principal, long taskId, MultipartFile file) {
        return documentService.uploadTaskDocument(principal, taskId, file);
    }

    public ErpTaskDocument linkTenderDocument(
            ErpPrincipal principal,
            long taskId,
            long tenderDocumentId,
            String originalFilename,
            String filePath
    ) {
        return documentService.linkTenderDocument(
                principal,
                taskId,
                tenderDocumentId,
                originalFilename,
                filePath);
    }

    public TaskDocumentDownload readTaskDocument(ErpPrincipal principal, long documentId) {
        return documentService.readTaskDocument(principal, documentId);
    }

    public void deleteTaskDocument(ErpPrincipal principal, long documentId) {
        documentService.deleteTaskDocument(principal, documentId);
    }

    public record TaskDocumentDownload(
            ErpTaskDocument document,
            TaskDocumentStorage.StoredContent stored
    ) {
    }

    public record PageResult<T>(
            long total,
            List<T> items
    ) {
    }
}
