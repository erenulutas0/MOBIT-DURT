package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.docsbot.ops.erp.domain.ErpMobilePushOutbox;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushOutboxRepository;
import com.docsbot.ops.erp.infrastructure.ErpMobilePushTokenRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
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
    private final MobilePushGateway gateway = mock(MobilePushGateway.class);
    private final MobilePushOutcomeRecorder outcomeRecorder = mock(MobilePushOutcomeRecorder.class);

    private final MobilePushOutboxService service = new MobilePushOutboxService(
            outboxRepository,
            tokenRepository,
            notificationRepository,
            gateway,
            outcomeRecorder,
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
        verify(outcomeRecorder).recordDead(eq(item.getId()), contains("already read"), any());
    }

    @Test
    void anAlertTooOldToActOnIsDroppedRatherThanDelivered() {
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofHours(6))));

        service.processDue();

        verify(gateway, never()).send(any(), any());
        verify(outcomeRecorder).recordDead(eq(item.getId()), contains("too old"), any());
    }

    @Test
    void afreshUnreadAlertIsStillDelivered() {
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofMinutes(2))));
        when(gateway.send(any(), any())).thenReturn(MobilePushGateway.Result.delivered());

        service.processDue();

        verify(gateway).send(any(), any());
        verify(outcomeRecorder).recordDelivered(eq(item.getId()), anyLong(), any());
    }

    @Test
    void aTokenFcmHasRefusedIsReportedAsPermanentSoItStopsBeingRetried() {
        // The bug this file could not see: every outcome was written onto a detached entity and
        // discarded, so a token FCM had already rejected stayed active and was retried forever.
        // Production carried 4,004 "FCM rejected token with HTTP 404" rows against twenty-three
        // tokens that were all still marked active, and 390 HTTP 429s from the retrying.
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofMinutes(2))));
        when(gateway.send(any(), any()))
                .thenReturn(MobilePushGateway.Result.dead("FCM rejected token with HTTP 404"));

        service.processDue();

        verify(outcomeRecorder).recordFailure(
                eq(item.getId()), anyLong(), anyLong(),
                contains("404"), eq(true), any(), any());
    }

    @Test
    void aTemporaryFailureIsRetriedRatherThanKillingTheToken() {
        ErpMobilePushOutbox item = queued();
        givenDue(item, notification(NOW.minus(Duration.ofMinutes(2))));
        when(gateway.send(any(), any()))
                .thenReturn(MobilePushGateway.Result.retry("FCM returned HTTP 429"));

        service.processDue();

        verify(outcomeRecorder).recordFailure(
                eq(item.getId()), anyLong(), anyLong(),
                contains("429"), eq(false), any(), any());
    }

    private void givenDue(ErpMobilePushOutbox item, ErpNotification notification) {
        when(gateway.configured()).thenReturn(true);
        when(outboxRepository.findTop50ByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                anyList(), any())).thenReturn(List.of(item));
        ErpMobilePushToken token =
                ErpMobilePushToken.create(7L, "android", "phone-1", "fcm-token", "1.0.28", NOW);
        ReflectionTestUtils.setField(token, "id", 22L);
        when(tokenRepository.findById(any())).thenReturn(Optional.of(token));
        when(notificationRepository.findById(any())).thenReturn(Optional.of(notification));
    }

    private static ErpMobilePushOutbox queued() {
        ErpMobilePushOutbox item = ErpMobilePushOutbox.create(1L, 1L, NOW.minus(Duration.ofMinutes(30)));
        // Given an id because the drain reports outcomes by id now, and in the real path the row
        // always arrives from a repository read.
        ReflectionTestUtils.setField(item, "id", 11L);
        return item;
    }

    private static ErpNotification notification(Instant createdAt) {
        ErpNotification notification = ErpNotification.create(
                7L, "task_due_soon", "Görev termini yaklaşıyor", "Site yapma",
                9L, "HIGH", "task_due_soon:9:24h", createdAt);
        // The failure record is written against the notification's id, so the fixture needs one.
        ReflectionTestUtils.setField(notification, "id", 33L);
        return notification;
    }
}
