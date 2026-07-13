package com.docsbot.ops.common.tx;

import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs a supplier inside a fresh physical transaction (REQUIRES_NEW). Used for
 * idempotent inserts guarded by a UNIQUE constraint: on a duplicate-key collision the
 * inner transaction rolls back cleanly and the exception propagates, leaving the caller's
 * outer transaction usable so it can re-fetch the winning row. Catching the constraint
 * violation inside the same transaction as the failed flush would instead leave it
 * marked rollback-only (Postgres aborts the transaction on a constraint error).
 */
@Component
public class NewTransactionExecutor {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public <T> T call(Supplier<T> action) {
        return action.get();
    }
}
