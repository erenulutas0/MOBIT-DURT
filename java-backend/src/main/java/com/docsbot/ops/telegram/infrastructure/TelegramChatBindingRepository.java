package com.docsbot.ops.telegram.infrastructure;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.telegram.domain.TelegramChatBinding;

public interface TelegramChatBindingRepository
        extends JpaRepository<TelegramChatBinding, Long> {
    Optional<TelegramChatBinding> findByChatId(String chatId);
}
