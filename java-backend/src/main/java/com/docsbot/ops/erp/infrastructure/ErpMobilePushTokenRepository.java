package com.docsbot.ops.erp.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.erp.domain.ErpMobilePushToken;

public interface ErpMobilePushTokenRepository extends JpaRepository<ErpMobilePushToken, Long> {

    Optional<ErpMobilePushToken> findByPlatformAndDeviceId(String platform, String deviceId);

    Optional<ErpMobilePushToken> findByUserIdAndPlatformAndDeviceId(long userId, String platform, String deviceId);

    List<ErpMobilePushToken> findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(long userId);
}
