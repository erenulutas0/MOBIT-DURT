package com.docsbot.ops.erp.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.erp.domain.ErpTaskAssignment;
import com.docsbot.ops.erp.domain.ErpTeamMember;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TaskAssigneeBatchTest {

    private static final Instant NOW = Instant.parse("2026-07-09T09:00:00Z");

    private final ErpTaskAssignmentRepository assignmentRepository = mock(ErpTaskAssignmentRepository.class);
    private final ErpTeamMemberRepository teamMemberRepository = mock(ErpTeamMemberRepository.class);

    @Test
    void resolvesDirectAndTeamAssigneesWithTwoQueries() {
        when(assignmentRepository.findAllByTaskIdInOrderByIdAsc(anyList())).thenReturn(List.of(
                ErpTaskAssignment.forUser(1L, 10L, NOW),
                ErpTaskAssignment.forUser(1L, 11L, NOW),
                ErpTaskAssignment.forTeam(1L, 100L, NOW),
                ErpTaskAssignment.forTeam(2L, 100L, NOW),
                ErpTaskAssignment.forUser(3L, 12L, NOW)));
        when(teamMemberRepository.findAllByTeamIdIn(anyCollection())).thenReturn(List.of(
                ErpTeamMember.create(100L, 11L, NOW),
                ErpTeamMember.create(100L, 20L, NOW)));

        Map<Long, Set<Long>> result = TaskAssigneeBatch.assignedUserIdsByTask(
                assignmentRepository,
                teamMemberRepository,
                List.of(1L, 2L, 3L, 4L));

        assertThat(result.get(1L)).containsExactly(10L, 11L, 20L);
        assertThat(result.get(2L)).containsExactly(11L, 20L);
        assertThat(result.get(3L)).containsExactly(12L);
        assertThat(result.get(4L)).isEmpty();
        verify(assignmentRepository).findAllByTaskIdInOrderByIdAsc(List.of(1L, 2L, 3L, 4L));
        verify(teamMemberRepository).findAllByTeamIdIn(Set.of(100L));
    }

    @Test
    void emptyInputIssuesNoQueries() {
        assertThat(TaskAssigneeBatch.assignedUserIdsByTask(
                assignmentRepository, teamMemberRepository, List.of())).isEmpty();
        verifyNoInteractions(assignmentRepository, teamMemberRepository);
    }
}
