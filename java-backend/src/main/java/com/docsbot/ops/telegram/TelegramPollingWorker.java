package com.docsbot.ops.telegram;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.docsbot.ops.common.config.DocsBotProperties;
import tools.jackson.databind.JsonNode;

@Component
@Profile("postgres")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "enabled",
        havingValue = "true")
@ConditionalOnProperty(
        prefix = "docsbot.telegram",
        name = "mode",
        havingValue = "polling",
        matchIfMissing = true)
public class TelegramPollingWorker {

    private static final Logger log = LoggerFactory.getLogger(TelegramPollingWorker.class);

    private final TelegramGateway gateway;
    private final TelegramUpdateProcessor processor;
    private final TelegramPollingStateStore stateStore;
    private final AtomicBoolean polling = new AtomicBoolean();

    public TelegramPollingWorker(
            TelegramGateway gateway,
            TelegramUpdateProcessor processor,
            TelegramPollingStateStore stateStore,
            TelegramAccessPolicy accessPolicy,
            DocsBotProperties properties
    ) {
        this.gateway = gateway;
        this.processor = processor;
        this.stateStore = stateStore;
        String token = properties.telegram().token();
        if (token == null || token.isBlank() || token.startsWith("replace-with")) {
            throw new IllegalStateException(
                    "TELEGRAM_POLLING_ENABLED requires a configured TELEGRAM_BOT_TOKEN");
        }
        if (!accessPolicy.hasChatRestrictions()) {
            log.warn(
                    "Telegram chat allowlist is empty; all groups can currently interact with the bot");
        }
        if (!accessPolicy.hasAdminRestrictions()) {
            log.warn(
                    "Telegram admin user allowlist is empty; Telegram group administrators can modify the organization catalog");
        }
    }

    @PostConstruct
    void registerCommands() {
        try {
            gateway.disableWebhook();
            gateway.registerCommands(List.of(
                    command("unit", "Kendi şirket kolunu seç"),
                    command("company", "İhale şirketini seç"),
                    command("company_search", "İhale şirketi ara"),
                    command("company_add", "Yeni ihale şirketi ekle"),
                    command("documents", "Son yüklenen dokümanları göster"),
                    command("stats", "İhale doküman istatistiklerini göster"),
                    command("tender_status", "Grubun ihale bağlantısını göster"),
                    command("security_info", "Grup ve kullanıcı ID bilgisini göster"),
                    command("help", "Kullanım rehberini göster")));
        } catch (RuntimeException exception) {
            log.warn("Telegram commands could not be registered: {}", exception.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${docsbot.telegram.poll-delay-ms:1000}")
    void poll() {
        if (!polling.compareAndSet(false, true)) return;
        TelegramPollingStateStore.PollingLease lease = null;
        try {
            lease = stateStore.tryAcquire();
            if (lease == null) return;
            for (JsonNode update : gateway.getUpdates(lease.offset())) {
                long updateId = update.path("update_id").asLong(-1);
                try {
                    processor.process(update);
                    if (updateId >= 0) stateStore.saveOffset(lease, updateId + 1);
                } catch (RuntimeException exception) {
                    log.error(
                            "Telegram update processing failed update_id={} message={}",
                            updateId,
                            exception.getMessage());
                    if (updateId < 0) continue;
                    boolean exhausted = stateStore.recordFailure(lease, updateId);
                    if (exhausted) {
                        log.error(
                                "Telegram update skipped after retry limit update_id={}",
                                updateId);
                        stateStore.saveOffset(lease, updateId + 1);
                        continue;
                    }
                    break;
                }
            }
        } catch (RuntimeException exception) {
            log.warn("Telegram polling request failed: {}", exception.getMessage());
        } finally {
            if (lease != null) {
                try {
                    stateStore.release(lease);
                } catch (RuntimeException exception) {
                    log.warn("Telegram polling lease could not be released: {}", exception.getMessage());
                }
            }
            polling.set(false);
        }
    }

    private Map<String, String> command(String command, String description) {
        return Map.of("command", command, "description", description);
    }
}
