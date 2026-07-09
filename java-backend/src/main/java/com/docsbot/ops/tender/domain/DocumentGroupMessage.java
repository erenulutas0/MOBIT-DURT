package com.docsbot.ops.tender.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_group_messages")
public class DocumentGroupMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "author_user_id")
    private Long authorUserId;

    @Column(name = "author_name", nullable = false)
    private String authorName;

    @Column(nullable = false, columnDefinition = "text")
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

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "sequence_no")
    private Long sequenceNo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentGroupMessage() {
    }

    public static DocumentGroupMessage create(
            long groupId,
            Long authorUserId,
            String authorName,
            String body,
            String messageKind,
            String mediaMimeType,
            String mediaData,
            Integer mediaDurationMs,
            String clientMessageId,
            Instant now
    ) {
        DocumentGroupMessage message = new DocumentGroupMessage();
        message.groupId = groupId;
        message.authorUserId = authorUserId;
        message.authorName = authorName;
        message.body = body.trim();
        message.messageKind = messageKind == null || messageKind.isBlank() ? "text" : messageKind.trim();
        message.mediaMimeType = mediaMimeType == null || mediaMimeType.isBlank() ? null : mediaMimeType.trim();
        message.mediaData = mediaData == null || mediaData.isBlank() ? null : mediaData.trim();
        message.mediaDurationMs = mediaDurationMs;
        message.clientMessageId = clientMessageId;
        message.deliveredAt = now;
        message.createdAt = now;
        return message;
    }

    public void assignSequenceNo(long sequenceNo) {
        if (this.sequenceNo == null) {
            this.sequenceNo = sequenceNo;
        }
    }

    public Long getId() { return id; }
    public Long getGroupId() { return groupId; }
    public Long getAuthorUserId() { return authorUserId; }
    public String getAuthorName() { return authorName; }
    public String getBody() { return body; }
    public String getMessageKind() { return messageKind; }
    public String getMediaMimeType() { return mediaMimeType; }
    public String getMediaData() { return mediaData; }
    public Integer getMediaDurationMs() { return mediaDurationMs; }
    public String getClientMessageId() { return clientMessageId; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public Long getSequenceNo() { return sequenceNo; }
    public Instant getCreatedAt() { return createdAt; }
}
