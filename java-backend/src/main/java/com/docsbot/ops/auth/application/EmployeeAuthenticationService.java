package com.docsbot.ops.auth.application;

import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.AuthSessionResponse;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.domain.UserStatus;
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
    public AuthSessionResponse login(String identifier, String password) {
        String normalized = identifier.trim().toLowerCase(Locale.ROOT);
        java.time.Instant now = java.time.Instant.now();
        // The single login field accepts either a username or an email, so we look the account up by
        // both. Doing it first (independent of the password) lets failures be counted per account and
        // a locked account be rejected before any password work is done.
        ErpUser user = userRepository.findByUsernameIgnoreCase(normalized)
                .or(() -> userRepository.findByEmailIgnoreCase(normalized))
                .filter(candidate -> candidate.getApprovedAt() != null)
                .filter(candidate -> candidate.getPasswordHash() != null)
                .orElse(null);

        if (user != null && user.isLocked(now)) {
            auditRecorder.record(subjectOf(user), "EMPLOYEE_LOGIN", "ERP_USER", user.getId().toString(), "LOCKED");
            throw new AuthExceptions.TooManyRequests(
                    "Çok fazla hatalı giriş denemesi. Lütfen bir süre sonra tekrar deneyin.");
        }

        boolean passwordOk = user != null && passwordEncoder.matches(password, user.getPasswordHash());
        if (!passwordOk) {
            if (user != null) {
                user.registerFailedLogin(now);
            }
            // Same generic message whether the identifier is unknown or the password is wrong — no
            // account enumeration.
            auditRecorder.record(normalized, "EMPLOYEE_LOGIN", "SESSION", null, "FAILURE");
            throw new AuthExceptions.Unauthorized("Invalid employee credentials");
        }

        user.clearLoginFailures();
        user.updatePresence(UserStatus.ONLINE, now);
        auditRecorder.record(subjectOf(user), "EMPLOYEE_LOGIN", "ERP_USER", user.getId().toString(), "SUCCESS");
        return refreshTokenService.issueSession(
                "user",
                subjectOf(user),
                user.getRole().name(),
                user.getName(),
                user.getId(),
                user.getEmail());
    }

    /**
     * Self-service registration: creates an active (auto-approved) employee from a chosen username
     * plus optional email/phone, then issues a session so the caller is logged in immediately.
     */
    @Transactional
    public AuthSessionResponse register(String name, String username, String email, String phone, String password) {
        String normalizedUsername = username.trim();
        String normalizedEmail = blankToNull(email) == null ? null : email.trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByUsernameIgnoreCase(normalizedUsername)) {
            throw new AuthExceptions.Conflict("Bu kullanıcı adı zaten alınmış.");
        }
        if (normalizedEmail != null && userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new AuthExceptions.Conflict("Bu e-posta ile bir hesap zaten var.");
        }
        java.time.Instant now = java.time.Instant.now();
        ErpUser user;
        try {
            user = userRepository.saveAndFlush(ErpUser.registeredEmployee(
                    name.trim(),
                    normalizedUsername,
                    normalizedEmail,
                    blankToNull(phone),
                    passwordEncoder.encode(password),
                    now));
        } catch (DataIntegrityViolationException exception) {
            // A concurrent request grabbed the same username/email between the checks and the insert.
            throw new AuthExceptions.Conflict("Bu kullanıcı adı veya e-posta zaten kayıtlı.");
        }
        user.updatePresence(UserStatus.ONLINE, now);
        auditRecorder.record(user.getUsername(), "EMPLOYEE_REGISTER", "ERP_USER", user.getId().toString(), "SUCCESS");
        return refreshTokenService.issueSession(
                "user",
                user.getUsername(),
                user.getRole().name(),
                user.getName(),
                user.getId(),
                user.getEmail());
    }

    private static String subjectOf(ErpUser user) {
        return user.getUsername() != null ? user.getUsername() : user.getEmail();
    }

    private static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim();
    }
}
