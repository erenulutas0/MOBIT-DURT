package com.docsbot.ops.erp.infrastructure;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpNotificationDelivery;

public interface ErpNotificationDeliveryRepository extends JpaRepository<ErpNotificationDelivery, Long> {

    List<ErpNotificationDelivery> findAllByChannelOrderByCreatedAtDescIdDesc(String channel);
}
