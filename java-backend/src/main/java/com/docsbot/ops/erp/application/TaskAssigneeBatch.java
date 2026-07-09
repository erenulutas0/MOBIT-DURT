package com.docsbot.ops.erp.application;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

/**
 * Resolves assigned user ids for many tasks with two queries instead of two per task.
 * Used by the scheduled scan loops (deadline, SLA), which previously issued per-task
 * assignment + team-member lookups every 60 seconds.
 */
final class TaskAssigneeBatch {

    private TaskAssigneeBatch() {
    }

    static Map<Long, Set<Long>> assignedUserIdsByTask(
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            Collection<Long> taskIds
    ) {
        Map<Long, Set<Long>> usersByTask = new LinkedHashMap<>();
        if (taskIds.isEmpty()) {
            return usersByTask;
        }
        taskIds.forEach(taskId -> usersByTask.put(taskId, new LinkedHashSet<>()));

        Map<Long, Set<Long>> teamsByTask = new LinkedHashMap<>();
        Set<Long> allTeamIds = new LinkedHashSet<>();
        assignmentRepository.findAllByTaskIdInOrderByIdAsc(List.copyOf(taskIds)).forEach(assignment -> {
            if (assignment.getAssigneeUserId() != null) {
                usersByTask.get(assignment.getTaskId()).add(assignment.getAssigneeUserId());
            }
            if (assignment.getAssigneeTeamId() != null) {
                teamsByTask.computeIfAbsent(assignment.getTaskId(), key -> new LinkedHashSet<>())
                        .add(assignment.getAssigneeTeamId());
                allTeamIds.add(assignment.getAssigneeTeamId());
            }
        });

        if (!allTeamIds.isEmpty()) {
            Map<Long, Set<Long>> usersByTeam = new LinkedHashMap<>();
            teamMemberRepository.findAllByTeamIdIn(allTeamIds).forEach(member ->
                    usersByTeam.computeIfAbsent(member.getTeamId(), key -> new LinkedHashSet<>())
                            .add(member.getUserId()));
            teamsByTask.forEach((taskId, teamIds) -> teamIds.forEach(teamId ->
                    usersByTask.get(taskId).addAll(usersByTeam.getOrDefault(teamId, Set.of()))));
        }
        return usersByTask;
    }
}
