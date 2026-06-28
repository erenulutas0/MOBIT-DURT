package com.docsbot.ops.telegram.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "telegram_chat_bindings")
public class TelegramChatBinding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chat_id", nullable = false, unique = true)
    private String chatId;

    @Column(name = "chat_title")
    private String chatTitle;

    @Column(name = "tender_id", nullable = false)
    private String tenderId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TelegramChatBinding() {
    }

    public static TelegramChatBinding bind(
            String chatId,
            String chatTitle,
            String tenderId
    ) {
        TelegramChatBinding binding = new TelegramChatBinding();
        binding.chatId = chatId;
        binding.chatTitle = chatTitle;
        binding.tenderId = tenderId;
        binding.createdAt = Instant.now();
        binding.updatedAt = binding.createdAt;
        return binding;
    }

    public void rebind(String chatTitle, String tenderId) {
        this.chatTitle = chatTitle;
        this.tenderId = tenderId;
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getChatId() { return chatId; }
    public String getChatTitle() { return chatTitle; }
    public String getTenderId() { return tenderId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
