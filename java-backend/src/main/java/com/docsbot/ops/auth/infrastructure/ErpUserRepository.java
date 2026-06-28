package com.docsbot.ops.auth.infrastructure;

import java.util.Optional;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.auth.domain.ErpUser;

public interface ErpUserRepository extends JpaRepository<ErpUser, Long> {

    Optional<ErpUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<ErpUser> findAllByOrderByCreatedAtDescIdDesc();

    List<ErpUser> findAllByOrderByNameAscIdAsc();
}
