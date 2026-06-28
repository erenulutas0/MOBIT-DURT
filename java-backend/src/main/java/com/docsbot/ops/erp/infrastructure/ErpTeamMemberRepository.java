package com.docsbot.ops.erp.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTeamMember;

public interface ErpTeamMemberRepository extends JpaRepository<ErpTeamMember, Long> {

    List<ErpTeamMember> findAllByUserId(Long userId);

    List<ErpTeamMember> findAllByTeamIdIn(Collection<Long> teamIds);

    boolean existsByTeamIdAndUserId(Long teamId, Long userId);

    void deleteByTeamIdAndUserId(Long teamId, Long userId);
}
