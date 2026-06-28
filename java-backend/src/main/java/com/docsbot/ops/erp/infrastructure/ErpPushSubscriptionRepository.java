package com.docsbot.ops.erp.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpPushSubscription;

public interface ErpPushSubscriptionRepository extends JpaRepository<ErpPushSubscription, Long> {

    Optional<ErpPushSubscription> findByEndpoint(String endpoint);

    Optional<ErpPushSubscription> findByUserIdAndEndpoint(Long userId, String endpoint);

    List<ErpPushSubscription> findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(Long userId);
}
