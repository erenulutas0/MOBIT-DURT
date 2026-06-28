package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpTeam;
import com.docsbot.ops.erp.domain.ErpTeamMember;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;

@Service
@Profile("postgres")
class ErpTeamService {
    private final ErpTeamRepository teamRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final ErpActivityRecorder activityRecorder;
    private final ErpTaskAccessService accessService;
    private final Clock clock;

    ErpTeamService(
            ErpTeamRepository teamRepository,
            ErpTeamMemberRepository teamMemberRepository,
            ErpActivityRecorder activityRecorder,
            ErpTaskAccessService accessService
    ) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.activityRecorder = activityRecorder;
        this.accessService = accessService;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    List<ErpTeam> listTeams(ErpPrincipal principal) {
        if (principal.admin()) {
            return teamRepository.findAllByOrderByNameAsc();
        }
        Set<Long> ownTeamIds = teamMemberRepository.findAllByUserId(principal.requireUserId()).stream()
                .map(member -> member.getTeamId())
                .collect(java.util.stream.Collectors.toSet());
        return teamRepository.findAllById(ownTeamIds);
    }

    @Transactional
    ErpTeam createTeam(ErpPrincipal principal, String name) {
        ErpValidation.requireAdmin(principal);
        String normalizedName = ErpValidation.normalizeName(name);
        if (teamRepository.existsByNameIgnoreCase(normalizedName)) {
            throw new ErpExceptions.BadRequest("Team name already exists");
        }
        try {
            ErpTeam team = teamRepository.saveAndFlush(ErpTeam.create(normalizedName, clock.instant()));
            activityRecorder.record(
                    principal,
                    "TEAM_CREATED",
                    "TEAM",
                    team.getId().toString(),
                    null,
                    "name=" + team.getName());
            return team;
        } catch (DataIntegrityViolationException exception) {
            throw new ErpExceptions.BadRequest("Team name already exists");
        }
    }

    @Transactional
    void addTeamMember(ErpPrincipal principal, long teamId, long userId) {
        ErpValidation.requireAdmin(principal);
        accessService.requireTeam(teamId);
        accessService.requireUser(userId);
        if (teamMemberRepository.existsByTeamIdAndUserId(teamId, userId)) {
            throw new ErpExceptions.BadRequest("User is already a team member");
        }
        try {
            teamMemberRepository.saveAndFlush(ErpTeamMember.create(teamId, userId, clock.instant()));
            activityRecorder.record(
                    principal,
                    "TEAM_MEMBER_ADDED",
                    "TEAM",
                    String.valueOf(teamId),
                    null,
                    "user_id=" + userId);
        } catch (DataIntegrityViolationException exception) {
            throw new ErpExceptions.BadRequest("User is already a team member");
        }
    }

    @Transactional
    void removeTeamMember(ErpPrincipal principal, long teamId, long userId) {
        ErpValidation.requireAdmin(principal);
        accessService.requireTeam(teamId);
        if (!teamMemberRepository.existsByTeamIdAndUserId(teamId, userId)) {
            throw new ErpExceptions.NotFound("Team membership not found");
        }
        teamMemberRepository.deleteByTeamIdAndUserId(teamId, userId);
        activityRecorder.record(
                principal,
                "TEAM_MEMBER_REMOVED",
                "TEAM",
                String.valueOf(teamId),
                null,
                "user_id=" + userId);
    }
}
