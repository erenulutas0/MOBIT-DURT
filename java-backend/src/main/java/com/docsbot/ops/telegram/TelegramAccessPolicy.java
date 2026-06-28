package com.docsbot.ops.telegram;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;

@Component
public class TelegramAccessPolicy {

    private final Set<String> allowedChatIds;
    private final Set<String> adminUserIds;

    public TelegramAccessPolicy(DocsBotProperties properties) {
        this.allowedChatIds = parse(properties.telegram().allowedChatIds());
        this.adminUserIds = parse(properties.telegram().adminUserIds());
    }

    public boolean isChatAllowed(String chatId) {
        return allowedChatIds.isEmpty() || allowedChatIds.contains(normalize(chatId));
    }

    public boolean isCatalogAdministrator(String userId) {
        return adminUserIds.isEmpty() || adminUserIds.contains(normalize(userId));
    }

    boolean hasChatRestrictions() {
        return !allowedChatIds.isEmpty();
    }

    boolean hasAdminRestrictions() {
        return !adminUserIds.isEmpty();
    }

    private Set<String> parse(String values) {
        if (values == null || values.isBlank()) return Set.of();
        return Arrays.stream(values.split(","))
                .map(this::normalize)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
