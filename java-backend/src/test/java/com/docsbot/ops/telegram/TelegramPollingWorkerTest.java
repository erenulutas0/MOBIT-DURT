package com.docsbot.ops.telegram;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.common.config.DocsBotProperties;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.Mockito.*;

class TelegramPollingWorkerTest {

    private final TelegramGateway gateway = mock(TelegramGateway.class);
    private final TelegramUpdateProcessor processor = mock(TelegramUpdateProcessor.class);
    private final TelegramPollingStateStore stateStore = mock(TelegramPollingStateStore.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void persistsOffsetAfterEachSuccessfulUpdateAndReleasesLease() throws Exception {
        var lease = new TelegramPollingStateStore.PollingLease("instance", 42L);
        when(stateStore.tryAcquire()).thenReturn(lease);
        when(gateway.getUpdates(42L)).thenReturn(List.of(
                objectMapper.readTree("{\"update_id\":42}"),
                objectMapper.readTree("{\"update_id\":43}")));

        worker().poll();

        verify(processor).process(argThat(update -> update.path("update_id").asLong() == 42));
        verify(processor).process(argThat(update -> update.path("update_id").asLong() == 43));
        verify(stateStore).saveOffset(lease, 43);
        verify(stateStore).saveOffset(lease, 44);
        verify(stateStore).release(lease);
    }

    @Test
    void keepsOffsetForRetryWhenProcessingFailsBelowLimit() throws Exception {
        var lease = new TelegramPollingStateStore.PollingLease("instance", 42L);
        var update = objectMapper.readTree("{\"update_id\":42}");
        when(stateStore.tryAcquire()).thenReturn(lease);
        when(gateway.getUpdates(42L)).thenReturn(List.of(update));
        doThrow(new IllegalStateException("temporary")).when(processor).process(update);
        when(stateStore.recordFailure(lease, 42)).thenReturn(false);

        worker().poll();

        verify(stateStore, never()).saveOffset(any(), anyLong());
        verify(stateStore).release(lease);
    }

    @Test
    void advancesPoisonUpdateAfterRetryLimit() throws Exception {
        var lease = new TelegramPollingStateStore.PollingLease("instance", 42L);
        var update = objectMapper.readTree("{\"update_id\":42}");
        when(stateStore.tryAcquire()).thenReturn(lease);
        when(gateway.getUpdates(42L)).thenReturn(List.of(update));
        doThrow(new IllegalStateException("permanent")).when(processor).process(update);
        when(stateStore.recordFailure(lease, 42)).thenReturn(true);

        worker().poll();

        verify(stateStore).saveOffset(lease, 43);
        verify(stateStore).release(lease);
    }

    @Test
    void doesNotPollWhenAnotherInstanceOwnsLease() {
        when(stateStore.tryAcquire()).thenReturn(null);

        worker().poll();

        verifyNoInteractions(gateway, processor);
    }

    private TelegramPollingWorker worker() {
        return new TelegramPollingWorker(
                gateway,
                processor,
                stateStore,
                new TelegramAccessPolicy(new DocsBotProperties(
                        "target/test-data",
                        "target/test-vault",
                        1024,
                        "salt",
                        false,
                        new DocsBotProperties.WebPush(false, "", "", "", 0),
                        new DocsBotProperties.MobilePush(false, "", "", "", "", "https://fcm.googleapis.com", "", "", "", "", "", "sandbox", "", 10),
                        new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                        new DocsBotProperties.Telegram(
                                true,
                                "test-token",
                                "http://127.0.0.1",
                                1,
                                1000,
                                "",
                                "",
                                "polling",
                                "",
                                ""),
                        new DocsBotProperties.Admin("admin", "password", "Admin"),
                        new DocsBotProperties.Jwt(
                                "issuer",
                                "01234567890123456789012345678901",
                                15))),
                new DocsBotProperties(
                        "target/test-data",
                        "target/test-vault",
                        1024,
                        "salt",
                        false,
                        new DocsBotProperties.WebPush(false, "", "", "", 0),
                        new DocsBotProperties.MobilePush(false, "", "", "", "", "https://fcm.googleapis.com", "", "", "", "", "", "sandbox", "", 10),
                        new DocsBotProperties.Email(false, false, "docsbot@example.com", null, "[DocsBot Ops]"),
                        new DocsBotProperties.Telegram(
                                true,
                                "test-token",
                                "http://127.0.0.1",
                                1,
                                1000,
                                "",
                                "",
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
