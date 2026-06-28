package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpTeam;

public interface ErpTeamRepository extends JpaRepository<ErpTeam, Long> {

    List<ErpTeam> findAllByOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);
}
