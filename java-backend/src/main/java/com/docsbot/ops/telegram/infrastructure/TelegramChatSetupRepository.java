package com.docsbot.ops.telegram.infrastructure;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.telegram.domain.TelegramChatSetup;

public interface TelegramChatSetupRepository
        extends JpaRepository<TelegramChatSetup, Long> {
    Optional<TelegramChatSetup> findByChatId(String chatId);
}
