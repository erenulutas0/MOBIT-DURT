package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskComment;
import com.docsbot.ops.erp.infrastructure.ErpTaskCommentRepository;

@Service
@Profile("postgres")
class ErpTaskCommentService {
    private final ErpTaskCommentRepository commentRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final ErpTaskAccessService accessService;
    private final Clock clock;

    ErpTaskCommentService(
            ErpTaskCommentRepository commentRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            ErpTaskAccessService accessService
    ) {
        this.commentRepository = commentRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.accessService = accessService;
        this.clock = Clock.systemUTC();
    }

    @Transactional
    ErpTaskComment createTaskComment(
            ErpPrincipal principal,
            long taskId,
            String body,
            String requestedKind
    ) {
        ErpTask task = accessService.requireTask(taskId);
        String cleanedBody = ErpValidation.normalizeRequiredMessage(body);
        Instant now = clock.instant();
        Long authorUserId = null;
        String kind;
        if (principal.admin()) {
            kind = "reply";
            notificationService.notifyUsers(
                    accessService.assignedUserIds(taskId),
                    "manager_message",
                    "Manager sent a message",
                    task.getTitle(),
                    task.getId(),
                    "NORMAL",
                    null,
                    now);
        } else {
            authorUserId = principal.requireUserId();
            if (!accessService.isAssigned(taskId, authorUserId)) {
                throw new ErpExceptions.Forbidden("Task is not assigned to this employee");
            }
            kind = "help".equalsIgnoreCase(requestedKind) ? "help" : "message";
            notificationService.notifyAdmin(
                    "employee_help_message",
                    "Employee sent a task message",
                    task.getTitle(),
                    task.getId(),
                    "NORMAL",
                    null,
                    now);
        }
        ErpTaskComment comment = commentRepository.saveAndFlush(ErpTaskComment.create(
                taskId,
                authorUserId,
                cleanedBody,
                kind,
                now));
        activityRecorder.record(
                principal,
                "TASK_COMMENT_CREATED",
                "TASK_COMMENT",
                comment.getId().toString(),
                taskId,
                "kind=" + comment.getKind());
        return comment;
    }
}
