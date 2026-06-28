package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;

import org.apache.http.HttpResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.domain.ErpPushSubscription;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;
import com.docsbot.ops.erp.infrastructure.ErpPushSubscriptionRepository;
import tools.jackson.databind.ObjectMapper;

import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import nl.martijndwars.webpush.Urgency;

@Service
@Profile("postgres")
public class WebPushService {

    private final DocsBotProperties properties;
    private final ErpPushSubscriptionRepository subscriptionRepository;
    private final ErpNotificationPreferenceRepository preferenceRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public WebPushService(
            DocsBotProperties properties,
            ErpPushSubscriptionRepository subscriptionRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            ObjectMapper objectMapper
    ) {
        this(properties, subscriptionRepository, preferenceRepository, deliveryRepository, objectMapper, Clock.systemUTC());
    }

    WebPushService(
            DocsBotProperties properties,
            ErpPushSubscriptionRepository subscriptionRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.preferenceRepository = preferenceRepository;
        this.deliveryRepository = deliveryRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public boolean configured() {
        return properties.webPush() != null && properties.webPush().configured();
    }

    public String publicKey() {
        return properties.webPush() == null ? "" : properties.webPush().publicKey();
    }

    @Transactional
    public ErpPushSubscription subscribe(
            ErpPrincipal principal,
            String endpoint,
            String p256dh,
            String auth,
            String userAgent
    ) {
        long userId = recipientId(principal);
        Instant now = clock.instant();
        return subscriptionRepository.findByEndpoint(endpoint)
                .map(subscription -> {
                    subscription.refresh(userId, p256dh, auth, userAgent, now);
                    return subscription;
                })
                .orElseGet(() -> subscriptionRepository.save(ErpPushSubscription.create(
                        userId,
                        endpoint,
                        p256dh,
                        auth,
                        userAgent,
                        now)));
    }

    @Transactional
    public void unsubscribe(ErpPrincipal principal, String endpoint) {
        long userId = recipientId(principal);
        subscriptionRepository.findByUserIdAndEndpoint(userId, endpoint)
                .ifPresent(subscription -> subscription.deactivate(clock.instant()));
    }

    @Transactional
    public void deliver(ErpNotification notification) {
        if (!configured() || !pushAllowed(notification.getUserId())) {
            return;
        }
        var subscriptions = subscriptionRepository.findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(notification.getUserId());
        if (subscriptions.isEmpty()) {
            return;
        }

        String payload = payload(notification);
        PushService pushService;
        try {
            pushService = new PushService(
                    properties.webPush().publicKey(),
                    properties.webPush().privateKey(),
                    properties.webPush().subject());
        } catch (Exception exception) {
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "WEB_PUSH",
                    "Web Push is misconfigured",
                    clock.instant()));
            return;
        }

        for (ErpPushSubscription subscription : subscriptions) {
            sendOne(pushService, notification, subscription, payload);
        }
    }

    private void sendOne(
            PushService pushService,
            ErpNotification notification,
            ErpPushSubscription subscription,
            String payload
    ) {
        Instant now = clock.instant();
        try {
            Subscription webPushSubscription = new Subscription(
                    subscription.getEndpoint(),
                    new Subscription.Keys(subscription.getP256dh(), subscription.getAuth()));
            Notification webPushNotification = new Notification(webPushSubscription, payload, Urgency.NORMAL);
            HttpResponse response = pushService.send(webPushNotification);
            int status = response.getStatusLine().getStatusCode();
            if (status >= 200 && status < 300) {
                subscription.markSuccess(now);
                deliveryRepository.save(ErpNotificationDelivery.accepted(notification.getId(), "WEB_PUSH", now));
                return;
            }
            boolean gone = status == 404 || status == 410;
            subscription.markFailure("Push service returned HTTP " + status, gone, now);
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "WEB_PUSH",
                    "Push service returned HTTP " + status,
                    now));
        } catch (Exception exception) {
            subscription.markFailure(exception.getMessage(), false, now);
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "WEB_PUSH",
                    exception.getMessage(),
                    now));
        }
    }

    private String payload(ErpNotification notification) {
        try {
            return objectMapper.writeValueAsString(new WebPushPayload(
                    notification.getId(),
                    notification.getTitle(),
                    notification.getBody(),
                    notification.getTaskId(),
                    "/"));
        } catch (Exception exception) {
            return "{\"title\":\"DocsBot notification\"}";
        }
    }

    private boolean pushAllowed(long userId) {
        return preferenceRepository.findById(userId)
                .map(preference -> preference.isBrowserPushEnabled())
                .orElse(false);
    }

    private long recipientId(ErpPrincipal principal) {
        return principal.admin() ? ErpNotification.ADMIN_RECIPIENT_ID : principal.requireUserId();
    }

    private record WebPushPayload(
            long notificationId,
            String title,
            String body,
            Long taskId,
            String url
    ) {
    }
}
