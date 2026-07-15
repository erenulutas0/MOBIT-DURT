package com.docsbot.ops.auth.application;

import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.AuthSessionResponse;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

@Service
@Profile("postgres")
public class EmployeeAuthenticationService {

    private final ErpUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuthAuditRecorder auditRecorder;

    public EmployeeAuthenticationService(
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService,
            AuthAuditRecorder auditRecorder
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.auditRecorder = auditRecorder;
    }

    @Transactional
    public AuthSessionResponse login(String email, String password) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        java.time.Instant now = java.time.Instant.now();
        // Look up the account first (independent of the password) so failures can be counted per
        // account and a locked account is rejected before any password work is done.
        ErpUser user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .filter(candidate -> candidate.getApprovedAt() != null)
                .filter(candidate -> candidate.getPasswordHash() != null)
                .orElse(null);

        if (user != null && user.isLocked(now)) {
            auditRecorder.record(user.getEmail(), "EMPLOYEE_LOGIN", "ERP_USER", user.getId().toString(), "LOCKED");
            throw new AuthExceptions.TooManyRequests(
                    "Çok fazla hatalı giriş denemesi. Lütfen bir süre sonra tekrar deneyin.");
        }

        boolean passwordOk = user != null && passwordEncoder.matches(password, user.getPasswordHash());
        if (!passwordOk) {
            if (user != null) {
                user.registerFailedLogin(now);
            }
            // Same generic message whether the email is unknown or the password is wrong — no
            // account enumeration.
            auditRecorder.record(normalizedEmail, "EMPLOYEE_LOGIN", "SESSION", null, "FAILURE");
            throw new AuthExceptions.Unauthorized("Invalid employee credentials");
        }

        user.clearLoginFailures();
        user.updatePresence(com.docsbot.ops.auth.domain.UserStatus.ONLINE, now);
        auditRecorder.record(user.getEmail(), "EMPLOYEE_LOGIN", "ERP_USER", user.getId().toString(), "SUCCESS");
        return refreshTokenService.issueSession(
                "user",
                user.getEmail(),
                user.getRole().name(),
                user.getName(),
                user.getId(),
                user.getEmail());
    }
}
