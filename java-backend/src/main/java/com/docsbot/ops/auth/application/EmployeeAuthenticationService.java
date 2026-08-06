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
import com.docsbot.ops.erp.application.NotificationService;

import org.springframework.beans.factory.ObjectProvider;

@Service
@Profile("postgres")
public class EmployeeAuthenticationService {

    private final ErpUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuthAuditRecorder auditRecorder;
    private final NotificationService notificationService;
    /**
     * The code a colleague is given so they can sign themselves up.
     *
     * <p>Registration used to be open to anyone who found the address, and it auto-approves —
     * so a stranger got a working employee account, which means the staff directory with
     * everyone's name, e-mail and phone, plus the company chat. Requiring a code keeps the
     * part the boss liked (sign up, land straight in the app) and closes the part nobody
     * intended.
     *
     * <p>Unset means registration is closed rather than open: an installation nobody has
     * configured yet is the one most likely to be found by someone else first, and a customer
     * who never sets this should end up with a locked door, not an open one.
     */
    private final String joinCode;

    public EmployeeAuthenticationService(
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService,
            AuthAuditRecorder auditRecorder
    ) {
        this(userRepository, passwordEncoder, refreshTokenService, auditRecorder,
                (NotificationService) null, "");
    }

    @org.springframework.beans.factory.annotation.Autowired
    public EmployeeAuthenticationService(
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService,
            AuthAuditRecorder auditRecorder,
            ObjectProvider<NotificationService> notificationService,
            @org.springframework.beans.factory.annotation.Value("${docsbot.registration.join-code:}")
            String joinCode
    ) {
        this(userRepository, passwordEncoder, refreshTokenService, auditRecorder,
                notificationService.getIfAvailable(), joinCode);
    }

    EmployeeAuthenticationService(
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService,
            AuthAuditRecorder auditRecorder,
            NotificationService notificationService,
            String joinCode
    ) {
        this.joinCode = joinCode == null ? "" : joinCode.trim();
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.auditRecorder = auditRecorder;
        this.notificationService = notificationService;
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
     * Admin-issued password reset — the only way back into an account whose password was forgotten.
     * The new password is a TEMPORARY credential (the admin knows it), so the account is flagged
     * until the owner replaces it, and they are told in-app that this happened. Deliberately does
     * NOT return a session: resetting someone else's password must never hand the admin their login.
     */
    @Transactional
    public void resetPassword(long userId, String newPassword) {
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new AuthExceptions.NotFound("Kullanıcı bulunamadı."));
        user.resetPasswordTo(passwordEncoder.encode(newPassword));
        auditRecorder.record(
                subjectOf(user), "EMPLOYEE_PASSWORD_RESET", "ERP_USER", user.getId().toString(), "ADMIN");
        if (notificationService != null) {
            notificationService.notifyUsers(
                    java.util.List.of(user.getId()),
                    "password_reset",
                    "Şifreniz sıfırlandı",
                    "Yöneticiniz size geçici bir şifre verdi. Lütfen Ayarlar'dan kendi şifrenizi belirleyin.",
                    null,
                    "HIGH",
                    // Time-based key: a second reset is a genuinely new event that must alert again.
                    "password_reset:" + user.getId() + ":" + java.time.Instant.now().toEpochMilli(),
                    java.time.Instant.now());
        }
    }

    /**
     * The owner replaces their password with one only they know, which clears the temporary flag.
     * Requires the current password, so a stolen session alone cannot take over the account.
     */
    @Transactional
    public void changeOwnPassword(long userId, String currentPassword, String newPassword) {
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new AuthExceptions.NotFound("Kullanıcı bulunamadı."));
        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            auditRecorder.record(
                    subjectOf(user), "EMPLOYEE_PASSWORD_CHANGE", "ERP_USER", user.getId().toString(), "FAILURE");
            throw new AuthExceptions.Unauthorized("Mevcut şifreniz hatalı.");
        }
        user.changePasswordTo(passwordEncoder.encode(newPassword));
        auditRecorder.record(
                subjectOf(user), "EMPLOYEE_PASSWORD_CHANGE", "ERP_USER", user.getId().toString(), "SUCCESS");
    }

    /**
     * Self-service registration: creates an active (auto-approved) employee from a chosen username
     * plus optional email/phone, then issues a session so the caller is logged in immediately.
     *
     * <p>Gated on the company's join code, because auto-approval means whoever gets through this is
     * a colleague as far as the rest of the system is concerned.
     */
    @Transactional
    public AuthSessionResponse register(String name, String username, String email, String phone,
                                        String password, String code) {
        requireJoinCode(code);
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
        // Self-registration is auto-approved, so nothing lands in "Hesap Talepleri" — tell the
        // admin a new account exists (they manage title/deletion from the Çalışanlar screen).
        if (notificationService != null) {
            notificationService.notifyAdmin(
                    "account_registered",
                    "Yeni kayıt: " + user.getName(),
                    user.getName() + " (" + user.getUsername() + ") uygulamaya kaydoldu. Ünvanını Çalışanlar ekranından atayabilirsiniz.",
                    null,
                    "NORMAL",
                    "account-registered:" + user.getId(),
                    now);
        }
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

    /**
     * Deliberately says which of the two situations it is. "Kayıt kapalı" sends someone to their
     * admin; "kod hatalı" tells them to check what they typed — and answering both with the same
     * sentence turns a five-second fix into a support call.
     */
    private void requireJoinCode(String code) {
        if (joinCode.isEmpty()) {
            throw new AuthExceptions.Forbidden(
                    "Kayıt kapalı. Hesap açmak için şirket yöneticinizle görüşün.");
        }
        String provided = code == null ? "" : code.trim();
        // Constant-time: the code is short and guessable enough that timing differences are worth
        // not leaking, and it costs nothing here.
        if (!java.security.MessageDigest.isEqual(
                provided.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                joinCode.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            throw new AuthExceptions.Forbidden("Şirket kodu hatalı.");
        }
    }

    private static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim();
    }
}
