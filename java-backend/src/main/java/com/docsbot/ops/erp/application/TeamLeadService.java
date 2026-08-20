package com.docsbot.ops.erp.application;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpTeam;
import com.docsbot.ops.erp.domain.ErpTeamMember;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamRepository;

/**
 * Lets the person who runs a crew hand out work inside it.
 *
 * <p>Until now every task in the company came from the admin account. That is fine for one office
 * and wrong for two: a site chief who cannot open a job for their own crew either waits for the
 * owner or the job never gets written down — and an operations tool people work around stops being
 * a record of anything.
 *
 * <p>The authority is narrow on purpose and checked here rather than at the security edge, because
 * what makes it safe is not the caller's role but the relationship between the caller, the team and
 * the people being assigned. A lead may assign only inside their own team; the admin path is left
 * exactly as it was.
 */
@Service
@Profile("postgres")
public class TeamLeadService {

    private final ErpTeamRepository teamRepository;
    private final ErpTeamMemberRepository memberRepository;
    private final ErpService erpService;

    public TeamLeadService(ErpTeamRepository teamRepository, ErpTeamMemberRepository memberRepository,
                           ErpService erpService) {
        this.teamRepository = teamRepository;
        this.memberRepository = memberRepository;
        this.erpService = erpService;
    }

    /** Whether this person may hand out work in this team. Admins may, everywhere. */
    @Transactional(readOnly = true)
    public boolean mayAssign(ErpPrincipal principal, long teamId) {
        if (principal.admin()) {
            return true;
        }
        if (principal.userId().isEmpty()) {
            return false;
        }
        return teamRepository.findById(teamId)
                .map(team -> team.getLeadUserId() != null
                        && team.getLeadUserId() == principal.requireUserId())
                .orElse(false);
    }

    /** The teams this person leads — what the mobile app needs to decide whether to offer the form. */
    @Transactional(readOnly = true)
    public List<ErpTeam> ledBy(ErpPrincipal principal) {
        if (principal.userId().isEmpty()) {
            return List.of();
        }
        return teamRepository.findByLeadUserId(principal.requireUserId());
    }

    /**
     * Opens a task inside one team.
     *
     * @throws ErpExceptions.Forbidden when the caller does not lead the team, or when an assignee
     *                                 is not in it — a lead's reach stops at their own crew, and
     *                                 letting one name an outsider would make the boundary
     *                                 decorative
     */
    @Transactional
    public ErpTask createTeamTask(ErpPrincipal principal, long teamId, String title,
                                  String description, Collection<Long> assigneeUserIds,
                                  String priority, Instant deadlineAt) {
        if (!mayAssign(principal, teamId)) {
            throw new ErpExceptions.Forbidden("Bu ekipte görev açma yetkiniz yok");
        }
        Set<Long> members = new LinkedHashSet<>();
        for (ErpTeamMember member : memberRepository.findAllByTeamIdIn(List.of(teamId))) {
            members.add(member.getUserId());
        }
        Set<Long> assignees = new LinkedHashSet<>(
                assigneeUserIds == null ? List.of() : assigneeUserIds);
        // An admin reaching through this door is still an admin and may name anyone; a lead may not.
        if (!principal.admin()) {
            for (Long assignee : assignees) {
                if (!members.contains(assignee)) {
                    throw new ErpExceptions.Forbidden(
                            "Yalnız kendi ekibinizdeki kişilere görev verebilirsiniz");
                }
            }
        }
        // No assignee named means the whole team, which is the common case for a crew job and
        // saves a lead ticking every name they already lead.
        Collection<Long> teams = assignees.isEmpty() ? List.of(teamId) : List.of();
        return erpService.createTask(principal, title, description, assignees, teams, null,
                java.util.Map.of(), priority, deadlineAt, null, null, null);
    }
}
