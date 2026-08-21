package com.docsbot.ops.auth.application;

import java.time.Instant;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

/**
 * Counts a failed login in a transaction of its own.
 *
 * <p>It has to be a separate bean, and the transaction has to be a new one, because the only thing
 * a failed login does afterwards is throw. A rejection is an exception, an exception rolls the
 * transaction back, and a counter incremented inside that transaction goes back with it — so the
 * lockout never armed. Measured on production before the fix: every account in the table sat at
 * failed_login_count = 0 and locked_until = null, for the whole life of the installation, while the
 * audit log recorded the failures happily. The audit log survives for exactly this reason —
 * PersistentAuthAuditRecorder is REQUIRES_NEW — and this is the same shape applied to the number
 * that actually stops an attack.
 *
 * <p>A separate bean rather than a method on the service: Spring's proxy is what starts the new
 * transaction, and a call to a sibling method on the same object never reaches it. That trap has
 * already cost this codebase one silently disabled job.
 *
 * <p>The account is re-read inside the new transaction rather than handed in. The instance the
 * caller holds belongs to the caller's persistence context, which is the one being rolled back;
 * writing it from here would mean two contexts owning one row.
 */
@Service
// Same profile as the service it serves and the repository it needs: without it, contexts that
// run without Postgres try to build this bean and fail to start.
@Profile("postgres")
public class LoginFailureRecorder {

    private final ErpUserRepository userRepository;

    public LoginFailureRecorder(ErpUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registerFailure(Long userId, Instant now) {
        if (userId == null) {
            return;
        }
        userRepository.findById(userId).ifPresent(user -> {
            user.registerFailedLogin(now);
            // Flushed here rather than left to the commit so a mapping mistake surfaces as a test
            // failure on this line instead of as a lockout that quietly never arms again.
            userRepository.saveAndFlush(user);
        });
    }
}
