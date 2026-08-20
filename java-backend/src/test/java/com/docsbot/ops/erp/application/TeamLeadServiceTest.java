package com.docsbot.ops.erp.application;

import java.util.List;
import java.util.OptionalLong;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docsbot.ops.erp.domain.ErpTeam;
import com.docsbot.ops.erp.domain.ErpTeamMember;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A lead's reach stops at their own crew. Everything worth testing here is a refusal: the boundary
 * is the whole feature, and one that can be talked around is decoration.
 */
class TeamLeadServiceTest {

    private static final long TEAM = 7L;
    private static final long LEAD = 3L;
    private static final long MEMBER = 4L;
    private static final long OUTSIDER = 9L;

    private final ErpTeamRepository teamRepository = mock(ErpTeamRepository.class);
    private final ErpTeamMemberRepository memberRepository = mock(ErpTeamMemberRepository.class);
    private final ErpService erpService = mock(ErpService.class);

    private final TeamLeadService service =
            new TeamLeadService(teamRepository, memberRepository, erpService);

    private static ErpPrincipal lead() {
        return new ErpPrincipal(false, OptionalLong.of(LEAD), "lead", "Şantiye Şefi");
    }

    private static ErpPrincipal employee() {
        return new ErpPrincipal(false, OptionalLong.of(MEMBER), "member", "Çalışan");
    }

    private static ErpPrincipal admin() {
        return new ErpPrincipal(true, OptionalLong.of(1L), "admin", "Yönetici");
    }

    private void teamLedBy(Long leadUserId, long... memberIds) {
        ErpTeam team = mock(ErpTeam.class);
        when(team.getLeadUserId()).thenReturn(leadUserId);
        when(teamRepository.findById(TEAM)).thenReturn(java.util.Optional.of(team));
        List<ErpTeamMember> members = java.util.Arrays.stream(memberIds).mapToObj(id -> {
            ErpTeamMember member = mock(ErpTeamMember.class);
            when(member.getUserId()).thenReturn(id);
            return member;
        }).toList();
        when(memberRepository.findAllByTeamIdIn(List.of(TEAM))).thenReturn(members);
    }

    @Test
    void aLeadMayOpenAJobForTheirOwnCrew() {
        teamLedBy(LEAD, LEAD, MEMBER);

        service.createTeamTask(lead(), TEAM, "Kalıp sökümü", null, List.of(MEMBER), "NORMAL", null);

        ArgumentCaptor<java.util.Collection<Long>> assignees = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(erpService).createTask(any(), eq("Kalıp sökümü"), any(), assignees.capture(),
                any(), any(), any(), anyString(), any(), any(), any(), any());
        assertThat(assignees.getValue()).containsExactly(MEMBER);
    }

    @Test
    void aLeadMayNotReachOutsideTheirOwnCrew() {
        teamLedBy(LEAD, LEAD, MEMBER);

        // Letting a lead name somebody from another team would make the boundary decorative.
        assertThatThrownBy(() -> service.createTeamTask(
                lead(), TEAM, "İş", null, List.of(OUTSIDER), "NORMAL", null))
                .isInstanceOf(ErpExceptions.Forbidden.class)
                .hasMessageContaining("kendi ekibinizdeki");
        verify(erpService, never()).createTask(any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any());
    }

    @Test
    void anOrdinaryMemberOfTheTeamStillMayNotAssign() {
        teamLedBy(LEAD, LEAD, MEMBER);

        // Being in the crew is not running it.
        assertThat(service.mayAssign(employee(), TEAM)).isFalse();
        assertThatThrownBy(() -> service.createTeamTask(
                employee(), TEAM, "İş", null, List.of(MEMBER), "NORMAL", null))
                .isInstanceOf(ErpExceptions.Forbidden.class);
    }

    @Test
    void aTeamWithNoLeadKeepsItsOldBehaviour() {
        teamLedBy(null, LEAD, MEMBER);

        // Every team had this behaviour before leads existed; an untouched one must keep it.
        assertThat(service.mayAssign(lead(), TEAM)).isFalse();
    }

    @Test
    void anAdminReachingThroughThisDoorIsStillAnAdmin() {
        teamLedBy(LEAD, LEAD, MEMBER);

        service.createTeamTask(admin(), TEAM, "İş", null, List.of(OUTSIDER), "NORMAL", null);

        verify(erpService).createTask(any(), anyString(), any(), any(), any(), any(), any(),
                anyString(), any(), any(), any(), any());
    }

    @Test
    void namingNobodyMeansTheWholeCrew() {
        teamLedBy(LEAD, LEAD, MEMBER);

        service.createTeamTask(lead(), TEAM, "Vardiya", null, List.of(), "NORMAL", null);

        ArgumentCaptor<java.util.Collection<Long>> teams = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(erpService).createTask(any(), anyString(), any(), any(), teams.capture(), any(),
                any(), anyString(), any(), any(), any(), any());
        // Saves a lead ticking every name they already lead.
        assertThat(teams.getValue()).containsExactly(TEAM);
    }
}
