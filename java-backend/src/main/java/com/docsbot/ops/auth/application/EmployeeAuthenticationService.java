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
        ErpUser user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .filter(candidate -> candidate.getApprovedAt() != null)
                .filter(candidate -> candidate.getPasswordHash() != null)
                .filter(candidate -> passwordEncoder.matches(password, candidate.getPasswordHash()))
                .orElse(null);
        if (user == null) {
            auditRecorder.record(
                    normalizedEmail,
                    "EMPLOYEE_LOGIN",
                    "SESSION",
                    null,
                    "FAILURE");
            throw new AuthExceptions.Unauthorized("Invalid employee credentials");
        }
        user.updatePresence(com.docsbot.ops.auth.domain.UserStatus.ONLINE, java.time.Instant.now());

        auditRecorder.record(
                user.getEmail(),
                "EMPLOYEE_LOGIN",
                "ERP_USER",
                user.getId().toString(),
                "SUCCESS");
        return refreshTokenService.issueSession(
                "user",
                user.getEmail(),
                user.getRole().name(),
                user.getName(),
                user.getId(),
                user.getEmail());
    }
}
