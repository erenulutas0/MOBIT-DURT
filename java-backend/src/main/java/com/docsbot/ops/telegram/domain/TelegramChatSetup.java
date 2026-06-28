package com.docsbot.ops.telegram.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "telegram_chat_setups")
public class TelegramChatSetup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chat_id", nullable = false, unique = true)
    private String chatId;

    @Column(name = "chat_title")
    private String chatTitle;

    @Column(name = "internal_unit")
    private String internalUnit;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TelegramChatSetup() {
    }

    public static TelegramChatSetup selectUnit(
            String chatId,
            String chatTitle,
            String internalUnit
    ) {
        TelegramChatSetup setup = new TelegramChatSetup();
        setup.chatId = chatId;
        setup.chatTitle = chatTitle;
        setup.internalUnit = internalUnit;
        setup.updatedAt = Instant.now();
        return setup;
    }

    public void update(String chatTitle, String internalUnit) {
        this.chatTitle = chatTitle;
        this.internalUnit = internalUnit;
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getChatId() { return chatId; }
    public String getChatTitle() { return chatTitle; }
    public String getInternalUnit() { return internalUnit; }
    public Instant getUpdatedAt() { return updatedAt; }
}
