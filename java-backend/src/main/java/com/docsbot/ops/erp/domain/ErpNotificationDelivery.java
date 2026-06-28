package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_notification_deliveries")
public class ErpNotificationDelivery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    @Column(nullable = false, length = 32)
    private String channel;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "error_message", length = 512)
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpNotificationDelivery() {
    }

    public static ErpNotificationDelivery accepted(long notificationId, String channel, Instant now) {
        ErpNotificationDelivery delivery = new ErpNotificationDelivery();
        delivery.notificationId = notificationId;
        delivery.channel = channel;
        delivery.status = "ACCEPTED";
        delivery.createdAt = now;
        return delivery;
    }

    public static ErpNotificationDelivery failed(long notificationId, String channel, String error, Instant now) {
        ErpNotificationDelivery delivery = new ErpNotificationDelivery();
        delivery.notificationId = notificationId;
        delivery.channel = channel;
        delivery.status = "FAILED";
        delivery.errorMessage = error == null ? null : error.substring(0, Math.min(error.length(), 512));
        delivery.createdAt = now;
        return delivery;
    }

    public Long getId() {
        return id;
    }

    public Long getNotificationId() {
        return notificationId;
    }

    public String getChannel() {
        return channel;
    }

    public String getStatus() {
        return status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
