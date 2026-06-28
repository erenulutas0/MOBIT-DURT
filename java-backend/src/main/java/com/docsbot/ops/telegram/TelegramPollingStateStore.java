package com.docsbot.ops.telegram;

public interface TelegramPollingStateStore {

    PollingLease tryAcquire();

    void saveOffset(PollingLease lease, long nextUpdateId);

    boolean recordFailure(PollingLease lease, long updateId);

    void release(PollingLease lease);

    record PollingLease(String owner, Long offset) {
    }
}
