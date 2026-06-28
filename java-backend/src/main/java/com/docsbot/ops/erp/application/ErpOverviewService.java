package com.docsbot.ops.erp.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.ErpDtos;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.ErpTaskComment;
import com.docsbot.ops.erp.domain.ErpTaskDocument;
import com.docsbot.ops.erp.domain.ErpTeam;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskCommentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskDocumentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;

@Service
@Profile("postgres")
class ErpOverviewService {
    private final ErpUserRepository userRepository;
    private final ErpTeamRepository teamRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTaskCommentRepository commentRepository;
    private final ErpTaskDocumentRepository documentRepository;
    private final NotificationService notificationService;
    private final ErpTaskAccessService accessService;

    ErpOverviewService(
            ErpUserRepository userRepository,
            ErpTeamRepository teamRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTaskCommentRepository commentRepository,
            ErpTaskDocumentRepository documentRepository,
            NotificationService notificationService,
            ErpTaskAccessService accessService
    ) {
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.assignmentRepository = assignmentRepository;
        this.commentRepository = commentRepository;
        this.documentRepository = documentRepository;
        this.notificationService = notificationService;
        this.accessService = accessService;
    }

    @Transactional(readOnly = true)
    ErpDtos.OverviewResponse overview(ErpPrincipal principal) {
        List<ErpUser> users = principal.admin()
                ? userRepository.findAllByOrderByCreatedAtDescIdDesc()
                : List.of(accessService.requireCurrentUser(principal));
        List<ErpTask> tasks = accessService.visibleTasks(principal);
        Set<Long> taskIds = tasks.stream().map(ErpTask::getId)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        List<ErpTaskAssignment> assignments = taskIds.isEmpty()
                ? List.of()
                : assignmentRepository.findAllByTaskIdInOrderByIdAsc(taskIds);
        List<ErpTaskComment> comments = taskIds.isEmpty()
                ? List.of()
                : commentRepository.findAllByTaskIdInOrderByCreatedAtDescIdDesc(taskIds);
        List<ErpTaskDocument> documents = taskIds.isEmpty()
                ? List.of()
                : documentRepository.findAllByTaskIdInOrderByCreatedAtDescIdDesc(taskIds);
        var notifications = notificationService.listNotifications(principal);
        List<ErpTeam> teams = principal.admin() ? teamRepository.findAllByOrderByNameAsc() : List.of();

        return new ErpDtos.OverviewResponse(
                users.stream().map(ErpDtos.UserResponse::from).toList(),
                teams.stream().map(ErpDtos.TeamResponse::from).toList(),
                tasks.stream().map(ErpDtos.TaskResponse::from).toList(),
                assignments.stream().map(ErpDtos.AssignmentResponse::from).toList(),
                documents.stream().map(ErpDtos.TaskDocumentResponse::from).toList(),
                comments.stream().map(ErpDtos.TaskCommentResponse::from).toList(),
                notifications.stream().map(ErpDtos.NotificationResponse::from).toList());
    }
}
