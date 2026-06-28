package com.docsbot.ops.telegram;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.common.config.DocsBotProperties;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TelegramAccessPolicyTest {

    @Test
    void emptyAllowlistsPreserveExistingBehavior() {
        TelegramAccessPolicy policy = policy("", "");

        assertTrue(policy.isChatAllowed("-1001"));
        assertTrue(policy.isCatalogAdministrator("42"));
        assertFalse(policy.hasChatRestrictions());
        assertFalse(policy.hasAdminRestrictions());
    }

    @Test
    void configuredAllowlistsRejectUnknownChatsAndUsers() {
        TelegramAccessPolicy policy = policy(" -1001, -1002 ", "42,84");

        assertTrue(policy.isChatAllowed("-1001"));
        assertFalse(policy.isChatAllowed("-1003"));
        assertTrue(policy.isCatalogAdministrator("84"));
        assertFalse(policy.isCatalogAdministrator("21"));
        assertTrue(policy.hasChatRestrictions());
        assertTrue(policy.hasAdminRestrictions());
    }

    private TelegramAccessPolicy policy(String chatIds, String adminIds) {
        return new TelegramAccessPolicy(new DocsBotProperties(
                "target/test-data",
                "target/test-vault",
                1024,
                "salt",
                false,
                new DocsBotProperties.WebPush(false, "", "", "", 0),
                new DocsBotProperties.MobilePush(false, "", "", "", "", "https://fcm.googleapis.com", "", "", "", "", "", "sandbox", "", 10),
                new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                new DocsBotProperties.Telegram(
                        false,
                        "test-token",
                        "http://127.0.0.1",
                        1,
                        1000,
                        chatIds,
                        adminIds,
                        "polling",
                        "",
                        ""),
                new DocsBotProperties.Admin("admin", "password", "Admin"),
                new DocsBotProperties.Jwt(
                        "issuer",
                        "01234567890123456789012345678901",
                        15)));
    }
}
