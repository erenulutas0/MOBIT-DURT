package com.docsbot.ops.erp.infrastructure;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpNotificationPreference;

public interface ErpNotificationPreferenceRepository extends JpaRepository<ErpNotificationPreference, Long> {
}
