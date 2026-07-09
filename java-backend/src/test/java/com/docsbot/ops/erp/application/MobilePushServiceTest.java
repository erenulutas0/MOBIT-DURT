package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationPreference;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;

import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MobilePushServiceTest {

    private static final long USER_ID = 42L;
    private static final Instant NOW = Instant.parse("2026-07-09T09:00:00Z");

    private final ErpMobilePushTokenRepository tokenRepository = mock(ErpMobilePushTokenRepository.class);
    private final ErpNotificationPreferenceRepository preferenceRepository =
            mock(ErpNotificationPreferenceRepository.class);
    private final ErpNotificationDeliveryRepository deliveryRepository =
            mock(ErpNotificationDeliveryRepository.class);
    private final MobilePushOutboxService outboxService = mock(MobilePushOutboxService.class);

    private final MobilePushService service = new MobilePushService(
            tokenRepository,
            preferenceRepository,
            deliveryRepository,
            outboxService,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void deliverIsGatedByMobilePushPreferenceNotBrowserPreference() {
        stubPreference(preference -> preference.update(
                null, null, null, null, null,
                true,
                false,
                null,
                NOW));

        int queued = service.deliver(notification());

        assertEquals(0, queued);
        verify(outboxService, never()).enqueue(anyLong(), anyLong());
        verify(tokenRepository, never()).findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(anyLong());
    }

    @Test
    void deliverQueuesActiveTokensWhenMobilePushEnabled() {
        stubPreference(preference -> preference.update(
                null, null, null, null, null,
                false,
                true,
                null,
                NOW));
        when(tokenRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(USER_ID))
                .thenReturn(List.of(token("device-1"), token("device-2")));

        int queued = service.deliver(notification());

        assertEquals(2, queued);
    }

    @Test
    void deliverDefaultsToAllowedWhenNoPreferenceRowExists() {
        when(preferenceRepository.findById(USER_ID)).thenReturn(Optional.empty());
        when(tokenRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(USER_ID))
                .thenReturn(List.of(token("device-1")));

        int queued = service.deliver(notification());

        assertEquals(1, queued);
    }

    private void stubPreference(java.util.function.Consumer<ErpNotificationPreference> customizer) {
        ErpNotificationPreference preference = ErpNotificationPreference.defaults(USER_ID, NOW);
        customizer.accept(preference);
        when(preferenceRepository.findById(USER_ID)).thenReturn(Optional.of(preference));
    }

    private ErpNotification notification() {
        ErpNotification notification = ErpNotification.create(
                USER_ID,
                "task_due_soon",
                "Task deadline is approaching",
                "Example task",
                7L,
                "HIGH",
                "task_due_soon:7:user:" + USER_ID,
                NOW);
        ReflectionTestUtils.setField(notification, "id", 100L);
        return notification;
    }

    private ErpMobilePushToken token(String deviceId) {
        ErpMobilePushToken token = ErpMobilePushToken.create(
                USER_ID, "android", deviceId, "token-" + deviceId, "1.0.7", NOW);
        ReflectionTestUtils.setField(token, "id", (long) deviceId.hashCode());
        return token;
    }
}
