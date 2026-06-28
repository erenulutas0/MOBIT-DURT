package com.docsbot.ops.telegram;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.common.config.DocsBotProperties;

@Repository
@Profile("postgres")
public class PostgresTelegramPollingStateStore implements TelegramPollingStateStore {

    private static final String BOT_KEY = "primary";

    private final JdbcClient jdbcClient;
    private final String owner;
    private final long leaseSeconds;

    public PostgresTelegramPollingStateStore(
            JdbcClient jdbcClient,
            DocsBotProperties properties
    ) {
        this.jdbcClient = jdbcClient;
        this.owner = instanceName();
        this.leaseSeconds = Math.max(
                120,
                Duration.ofSeconds(properties.telegram().pollTimeoutSeconds())
                        .plusSeconds(15)
                        .toSeconds());
    }

    @Override
    @Transactional
    public PollingLease tryAcquire() {
        jdbcClient.sql("""
                INSERT INTO telegram_polling_state(bot_key)
                VALUES (:botKey)
                ON CONFLICT (bot_key) DO NOTHING
                """)
                .param("botKey", BOT_KEY)
                .update();

        int claimed = jdbcClient.sql("""
                UPDATE telegram_polling_state
                SET lease_owner = :owner,
                    lease_until = CURRENT_TIMESTAMP + (:leaseSeconds * INTERVAL '1 second'),
                    updated_at = CURRENT_TIMESTAMP
                WHERE bot_key = :botKey
                  AND (
                    lease_until IS NULL
                    OR lease_until < CURRENT_TIMESTAMP
                    OR lease_owner = :owner
                  )
                """)
                .param("owner", owner)
                .param("leaseSeconds", leaseSeconds)
                .param("botKey", BOT_KEY)
                .update();
        if (claimed == 0) return null;

        Long offset = jdbcClient.sql("""
                SELECT next_update_id
                FROM telegram_polling_state
                WHERE bot_key = :botKey AND lease_owner = :owner
                """)
                .param("botKey", BOT_KEY)
                .param("owner", owner)
                .query(Long.class)
                .optional()
                .orElse(null);
        return new PollingLease(owner, offset);
    }

    @Override
    @Transactional
    public void saveOffset(PollingLease lease, long nextUpdateId) {
        int updated = jdbcClient.sql("""
                UPDATE telegram_polling_state
                SET next_update_id = GREATEST(COALESCE(next_update_id, 0), :nextUpdateId),
                    failure_update_id = NULL,
                    failure_count = 0,
                    lease_until = CURRENT_TIMESTAMP + (:leaseSeconds * INTERVAL '1 second'),
                    updated_at = CURRENT_TIMESTAMP
                WHERE bot_key = :botKey AND lease_owner = :owner
                """)
                .param("nextUpdateId", nextUpdateId)
                .param("leaseSeconds", leaseSeconds)
                .param("botKey", BOT_KEY)
                .param("owner", lease.owner())
                .update();
        if (updated == 0) {
            throw new IllegalStateException("Telegram polling lease was lost");
        }
    }

    @Override
    @Transactional
    public boolean recordFailure(PollingLease lease, long updateId) {
        Integer failureCount = jdbcClient.sql("""
                UPDATE telegram_polling_state
                SET failure_count = CASE
                        WHEN failure_update_id = :updateId THEN failure_count + 1
                        ELSE 1
                    END,
                    failure_update_id = :updateId,
                    lease_until = CURRENT_TIMESTAMP + (:leaseSeconds * INTERVAL '1 second'),
                    updated_at = CURRENT_TIMESTAMP
                WHERE bot_key = :botKey AND lease_owner = :owner
                RETURNING failure_count
                """)
                .param("updateId", updateId)
                .param("leaseSeconds", leaseSeconds)
                .param("botKey", BOT_KEY)
                .param("owner", lease.owner())
                .query(Integer.class)
                .optional()
                .orElseThrow(() -> new IllegalStateException(
                        "Telegram polling lease was lost"));
        return failureCount >= 3;
    }

    @Override
    @Transactional
    public void release(PollingLease lease) {
        jdbcClient.sql("""
                UPDATE telegram_polling_state
                SET lease_owner = NULL,
                    lease_until = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE bot_key = :botKey AND lease_owner = :owner
                """)
                .param("botKey", BOT_KEY)
                .param("owner", lease.owner())
                .update();
    }

    private String instanceName() {
        String hostname = Optional.ofNullable(System.getenv("HOSTNAME"))
                .filter(value -> !value.isBlank())
                .orElseGet(this::localHostname);
        return hostname + ":" + UUID.randomUUID();
    }

    private String localHostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException ignored) {
            return "docsbot";
        }
    }
}
