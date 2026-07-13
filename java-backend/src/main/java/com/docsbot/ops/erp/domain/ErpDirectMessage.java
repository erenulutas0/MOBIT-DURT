package com.docsbot.ops.erp.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "erp_direct_messages")
public class ErpDirectMessage {

    public static final String ACTOR_ADMIN = "admin";
    public static final String ACTOR_USER = "user";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sender_type", nullable = false, length = 16)
    private String senderType;

    @Column(name = "sender_user_id")
    private Long senderUserId;

    @Column(name = "sender_name", nullable = false)
    private String senderName;

    @Column(name = "recipient_type", nullable = false, length = 16)
    private String recipientType;

    @Column(name = "recipient_user_id")
    private Long recipientUserId;

    @Column(name = "recipient_name", nullable = false)
    private String recipientName;

    @Column(nullable = false)
    private String body;

    @Column(name = "message_kind", nullable = false, length = 16)
    private String messageKind;

    @Column(name = "media_mime_type", length = 128)
    private String mediaMimeType;

    @Column(name = "media_data")
    private String mediaData;

    @Column(name = "media_duration_ms")
    private Integer mediaDurationMs;

    @Column(name = "client_message_id", length = 128)
    private String clientMessageId;

    @Column(name = "reply_to_message_id")
    private Long replyToMessageId;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ErpDirectMessage() {
    }

    public static ErpDirectMessage create(
            String senderType,
            Long senderUserId,
            String senderName,
            String recipientType,
            Long recipientUserId,
            String recipientName,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs,
            String clientMessageId,
            Long replyToMessageId,
            Instant createdAt
    ) {
        ErpDirectMessage message = new ErpDirectMessage();
        message.senderType = senderType;
        message.senderUserId = senderUserId;
        message.senderName = senderName;
        message.recipientType = recipientType;
        message.recipientUserId = recipientUserId;
        message.recipientName = recipientName;
        message.body = body;
        message.messageKind = messageKind;
        message.mediaMimeType = mediaMimeType;
        message.mediaData = mediaData;
        message.mediaDurationMs = mediaDurationMs;
        message.clientMessageId = clientMessageId;
        message.replyToMessageId = replyToMessageId;
        message.deliveredAt = createdAt;
        message.createdAt = createdAt;
        return message;
    }

    public boolean visibleTo(boolean admin, long userId) {
        if (admin) {
            return ACTOR_ADMIN.equals(senderType) || ACTOR_ADMIN.equals(recipientType);
        }
        return (ACTOR_USER.equals(senderType) && senderUserId != null && senderUserId == userId)
                || (ACTOR_USER.equals(recipientType) && recipientUserId != null && recipientUserId == userId);
    }

    public boolean recipientMatches(boolean admin, long userId) {
        if (admin) {
            return ACTOR_ADMIN.equals(recipientType);
        }
        return ACTOR_USER.equals(recipientType) && recipientUserId != null && recipientUserId == userId;
    }

    public void markRead(Instant readAt) {
        if (this.readAt == null) {
            this.readAt = readAt;
        }
    }

    public Long getId() {
        return id;
    }

    public String getSenderType() {
        return senderType;
    }

    public Long getSenderUserId() {
        return senderUserId;
    }

    public String getSenderName() {
        return senderName;
    }

    public String getRecipientType() {
        return recipientType;
    }

    public Long getRecipientUserId() {
        return recipientUserId;
    }

    public String getRecipientName() {
        return recipientName;
    }

    public String getBody() {
        return body;
    }

    public String getMessageKind() {
        return messageKind;
    }

    public String getMediaMimeType() {
        return mediaMimeType;
    }

    public String getMediaData() {
        return mediaData;
    }

    public Integer getMediaDurationMs() {
        return mediaDurationMs;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public Long getReplyToMessageId() {
        return replyToMessageId;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
