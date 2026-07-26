package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The queue used to send whatever it was handed, however old and whatever had happened since. A
 * backlog built up while delivery was failing would later buzz the phone about alerts the user had
 * already read in the app — reported as "hepsini okudum ama bildirim gelmeye devam ediyor".
 */
class MobilePushOutboxServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-26T16:00:00Z");

    private final ErpMobilePushOutboxRepository outboxRepository = mock(ErpMobilePushOutboxRepository.class);
    private final ErpMobilePushTokenRepository tokenRepository = mock(ErpMobilePushTokenRepository.class);
    private final ErpNotificationRepository notificationRepository = mock(ErpNotificationRepository.class);
    private final ErpNotificationDeliveryRepository deliveryRepository =
            mock(ErpNotificationDeliveryRepository.class);
    private final MobilePushGateway gateway = mock(MobilePushGateway.class);

    private final MobilePushOutboxService service = new MobilePushOutboxService(
            outboxRepository,
            tokenRepository,
            notificationRepository,
            deliveryRepository,
            gateway,
            Duration.ofMinutes(120),
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void anAlertTheUserAlreadyReadIsNotPushedToTheirPhone() {
        ErpMobilePushOutbox item = queued();
        ErpNotification notification = notification(NOW.minus(Duration.ofMinutes(5)));
        notification.markRead(NOW.minus(Duration.ofMinutes(1)));
        givenDue(item, notification);

        service.processDue();

        verify(gateway, never()).send(any(), any());
        assertThat(item.getStatus()).isEqualTo(ErpMobilePushOutbox.STATUS_DEAD);
    }

    @Test
    void anAlertTooOldToActOnIsDroppedRatherThanDelivered() {
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofHours(6))));

        service.processDue();

        verify(gateway, never()).send(any(), any());
        assertThat(item.getStatus()).isEqualTo(ErpMobilePushOutbox.STATUS_DEAD);
    }

    @Test
    void afreshUnreadAlertIsStillDelivered() {
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofMinutes(2))));
        when(gateway.send(any(), any())).thenReturn(MobilePushGateway.Result.delivered());

        service.processDue();

        verify(gateway).send(any(), any());
        assertThat(item.getStatus()).isEqualTo(ErpMobilePushOutbox.STATUS_DELIVERED);
    }

    private void givenDue(ErpMobilePushOutbox item, ErpNotification notification) {
        when(gateway.configured()).thenReturn(true);
        when(outboxRepository.findTop50ByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                anyList(), any())).thenReturn(List.of(item));
        when(tokenRepository.findById(any())).thenReturn(Optional.of(
                ErpMobilePushToken.create(7L, "android", "phone-1", "fcm-token", "1.0.28", NOW)));
        when(notificationRepository.findById(any())).thenReturn(Optional.of(notification));
    }

    private static ErpMobilePushOutbox queued() {
        return ErpMobilePushOutbox.create(1L, 1L, NOW.minus(Duration.ofMinutes(30)));
    }

    private static ErpNotification notification(Instant createdAt) {
        return ErpNotification.create(
                7L, "task_due_soon", "Görev termini yaklaşıyor", "Site yapma",
                9L, "HIGH", "task_due_soon:9:24h", createdAt);
    }
}
