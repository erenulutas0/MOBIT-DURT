package com.docsbot.ops.auth.infrastructure;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.auth.domain.AccountRequestStatus;
import com.docsbot.ops.auth.domain.ErpAccountRequest;

public interface ErpAccountRequestRepository extends JpaRepository<ErpAccountRequest, Long> {

    boolean existsByEmailIgnoreCaseAndStatus(String email, AccountRequestStatus status);

    Optional<ErpAccountRequest> findFirstByEmailIgnoreCaseAndStatusOrderByCreatedAtDescIdDesc(
            String email, AccountRequestStatus status);

    List<ErpAccountRequest> findAllByStatusOrderByCreatedAtDescIdDesc(AccountRequestStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from ErpAccountRequest request where request.id = :id")
    Optional<ErpAccountRequest> findByIdForUpdate(@Param("id") Long id);
}
