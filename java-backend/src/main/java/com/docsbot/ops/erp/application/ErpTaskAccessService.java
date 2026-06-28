package com.docsbot.ops.erp.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.ErpTeam;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;

@Service
@Profile("postgres")
class ErpTaskAccessService {
    private final ErpUserRepository userRepository;
    private final ErpTeamRepository teamRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;

    ErpTaskAccessService(
            ErpUserRepository userRepository,
            ErpTeamRepository teamRepository,
            ErpTeamMemberRepository teamMemberRepository,
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository
    ) {
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
    }

    List<ErpTask> visibleTasks(ErpPrincipal principal) {
        if (principal.admin()) {
            return taskRepository.findAllByOrderByCreatedAtDescIdDesc();
        }
        long userId = principal.requireUserId();
        Set<Long> teamIds = teamMemberRepository.findAllByUserId(userId).stream()
                .map(member -> member.getTeamId())
                .collect(java.util.stream.Collectors.toSet());
        Set<Long> taskIds = new LinkedHashSet<>();
        assignmentRepository.findAllByAssigneeUserId(userId)
                .forEach(assignment -> taskIds.add(assignment.getTaskId()));
        if (!teamIds.isEmpty()) {
            assignmentRepository.findAllByAssigneeTeamIdIn(teamIds)
                    .forEach(assignment -> taskIds.add(assignment.getTaskId()));
        }
        return taskIds.isEmpty()
                ? List.of()
                : taskRepository.findAllByIdInOrderByCreatedAtDescIdDesc(taskIds);
    }

    ErpTask getVisibleTask(ErpPrincipal principal, long taskId) {
        ErpTask task = requireTask(taskId);
        if (!principal.admin() && !isAssigned(taskId, principal.requireUserId())) {
            throw new ErpExceptions.NotFound("Task not found");
        }
        return task;
    }

    ErpTask requireTask(long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Task not found"));
    }

    boolean isAssigned(long taskId, long userId) {
        if (assignmentRepository.existsByTaskIdAndAssigneeUserId(taskId, userId)) {
            return true;
        }
        Set<Long> teamIds = teamMemberRepository.findAllByUserId(userId).stream()
                .map(member -> member.getTeamId())
                .collect(java.util.stream.Collectors.toSet());
        return !teamIds.isEmpty() && assignmentRepository.findAllByAssigneeTeamIdIn(teamIds).stream()
                .anyMatch(assignment -> assignment.getTaskId() == taskId);
    }

    Set<Long> assignedUserIds(long taskId) {
        Set<Long> userIds = new LinkedHashSet<>();
        List<ErpTaskAssignment> assignments =
                assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.of(taskId));
        Set<Long> teamIds = new LinkedHashSet<>();
        for (ErpTaskAssignment assignment : assignments) {
            if (assignment.getAssigneeUserId() != null) {
                userIds.add(assignment.getAssigneeUserId());
            }
            if (assignment.getAssigneeTeamId() != null) {
                teamIds.add(assignment.getAssigneeTeamId());
            }
        }
        if (!teamIds.isEmpty()) {
            teamMemberRepository.findAllByTeamIdIn(teamIds)
                    .forEach(member -> userIds.add(member.getUserId()));
        }
        return userIds;
    }

    void validateTargets(Set<Long> userIds, Set<Long> teamIds) {
        if (userRepository.findAllById(userIds).size() != userIds.size()) {
            throw new ErpExceptions.BadRequest("One or more assignee users do not exist");
        }
        if (teamRepository.findAllById(teamIds).size() != teamIds.size()) {
            throw new ErpExceptions.BadRequest("One or more assignee teams do not exist");
        }
    }

    ErpUser requireCurrentUser(ErpPrincipal principal) {
        return requireUser(principal.requireUserId());
    }

    ErpUser requireUser(long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Authenticated user not found"));
    }

    ErpTeam requireTeam(long teamId) {
        return teamRepository.findById(teamId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Team not found"));
    }
}
