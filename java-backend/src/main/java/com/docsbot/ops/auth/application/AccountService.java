package com.docsbot.ops.auth.application;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.AccountRequestStatus;
import com.docsbot.ops.auth.domain.ErpAccountRequest;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.application.ErpActivityRecorder;
import com.docsbot.ops.erp.application.NotificationService;

@Service
@Profile("postgres")
public class AccountService {

    private final ErpAccountRequestRepository requestRepository;
    private final ErpUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthAuditRecorder auditRecorder;
    private final ErpActivityRecorder activityRecorder;
    private final NotificationService notificationService;
    private final AccountEmailService accountEmailService;
    private final DocsBotProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public AccountService(
            ErpAccountRequestRepository requestRepository,
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthAuditRecorder auditRecorder,
            ErpActivityRecorder activityRecorder,
            NotificationService notificationService,
            AccountEmailService accountEmailService,
            DocsBotProperties properties
    ) {
        this(requestRepository, userRepository, passwordEncoder, auditRecorder, activityRecorder,
                notificationService, accountEmailService, properties, Clock.systemUTC());
    }

    AccountService(
            ErpAccountRequestRepository requestRepository,
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthAuditRecorder auditRecorder,
            ErpActivityRecorder activityRecorder,
            NotificationService notificationService,
            AccountEmailService accountEmailService,
            DocsBotProperties properties,
            Clock clock
    ) {
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditRecorder = auditRecorder;
        this.activityRecorder = activityRecorder;
        this.notificationService = notificationService;
        this.accountEmailService = accountEmailService;
        this.properties = properties;
        this.clock = clock;
    }

    private boolean emailVerificationEnabled() {
        return properties.account() != null && properties.account().emailVerificationEnabled();
    }

    private int codeTtlMinutes() {
        int ttl = properties.account() != null ? properties.account().codeTtlMinutes() : 15;
        return ttl > 0 ? ttl : 15;
    }

    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    @Transactional
    public ErpAccountRequest createRequest(String name, String email, String phone, String password) {
        String normalizedEmail = normalizeEmail(email);
        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new AuthExceptions.Conflict("An account already exists for this email");
        }
        if (requestRepository.existsByEmailIgnoreCaseAndStatus(
                normalizedEmail,
                AccountRequestStatus.PENDING)) {
            throw new AuthExceptions.Conflict("A pending request already exists for this email");
        }

        ErpAccountRequest request = ErpAccountRequest.pending(
                name.trim(),
                normalizedEmail,
                normalizeOptional(phone),
                passwordEncoder.encode(password),
                clock.instant());
        String verificationCode = null;
        if (emailVerificationEnabled()) {
            verificationCode = generateCode();
            request.startVerification(
                    passwordEncoder.encode(verificationCode),
                    clock.instant().plus(Duration.ofMinutes(codeTtlMinutes())));
        }
        try {
            ErpAccountRequest saved = requestRepository.saveAndFlush(request);
            if (verificationCode != null) {
                // Sent inside the transaction: if email delivery fails the whole request rolls
                // back, so the user is told registration didn't complete rather than being stranded
                // with an unsendable code.
                accountEmailService.sendVerificationCode(saved.getEmail(), saved.getName(), verificationCode);
            }
            notificationService.notifyAdmin(
                    "account_request_created",
                    "Yeni hesap talebi",
                    saved.getName() + " hesap açmak istiyor.",
                    null,
                    "NORMAL",
                    "account-request:" + saved.getId(),
                    saved.getCreatedAt());
            activityRecorder.recordActor(
                    "public",
                    null,
                    normalizedEmail,
                    "ACCOUNT_REQUEST_CREATED",
                    "ACCOUNT_REQUEST",
                    saved.getId().toString(),
                    null,
                    "requested_role=" + saved.getRequestedRole().name().toLowerCase(Locale.ROOT));
            return saved;
        } catch (DataIntegrityViolationException exception) {
            throw new AuthExceptions.Conflict("An account or pending request already exists for this email");
        }
    }

    @Transactional
    public void verifyEmail(String email, String code) {
        String normalizedEmail = normalizeEmail(email);
        ErpAccountRequest request = requestRepository
                .findFirstByEmailIgnoreCaseAndStatusOrderByCreatedAtDescIdDesc(normalizedEmail, AccountRequestStatus.PENDING)
                .orElseThrow(() -> new AuthExceptions.NotFound("Doğrulanacak bir hesap talebi bulunamadı."));
        ErpAccountRequest.VerificationResult result = request.verifyCode(
                code == null ? "" : code.trim(), passwordEncoder, clock.instant());
        switch (result) {
            case VERIFIED, ALREADY_VERIFIED -> auditRecorder.record(
                    normalizedEmail, "ACCOUNT_EMAIL_VERIFIED", "ACCOUNT_REQUEST", request.getId().toString(), "SUCCESS");
            case EXPIRED -> throw new AuthExceptions.Conflict("Kodun süresi doldu. Lütfen yeni kod isteyin.");
            case LOCKED_OUT -> throw new AuthExceptions.TooManyRequests("Çok fazla hatalı deneme. Lütfen yeni kod isteyin.");
            case INVALID_CODE -> throw new AuthExceptions.Unauthorized("Doğrulama kodu hatalı.");
        }
    }

    @Transactional
    public void resendCode(String email) {
        if (!emailVerificationEnabled()) {
            return;
        }
        String normalizedEmail = normalizeEmail(email);
        // Silent no-op when there's nothing to resend, so this can't be used to probe which emails
        // have a pending request.
        ErpAccountRequest request = requestRepository
                .findFirstByEmailIgnoreCaseAndStatusOrderByCreatedAtDescIdDesc(normalizedEmail, AccountRequestStatus.PENDING)
                .orElse(null);
        if (request == null || request.isEmailVerified()) {
            return;
        }
        String verificationCode = generateCode();
        request.startVerification(
                passwordEncoder.encode(verificationCode),
                clock.instant().plus(Duration.ofMinutes(codeTtlMinutes())));
        accountEmailService.sendVerificationCode(request.getEmail(), request.getName(), verificationCode);
    }

    @Transactional(readOnly = true)
    public List<ErpAccountRequest> list(AccountRequestStatus status) {
        return requestRepository.findAllByStatusOrderByCreatedAtDescIdDesc(status);
    }

    @Transactional
    public ErpUser approve(long requestId, String decidedBy) {
        ErpAccountRequest request = getPendingForUpdate(requestId);
        if (emailVerificationEnabled() && !request.isEmailVerified()) {
            throw new AuthExceptions.Conflict("E-posta doğrulanmadan hesap onaylanamaz.");
        }
        if (userRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new AuthExceptions.Conflict("An account already exists for this email");
        }

        Instant now = clock.instant();
        ErpUser user = userRepository.saveAndFlush(ErpUser.approvedEmployee(
                request.getName(),
                request.getEmail(),
                request.getPhone(),
                request.getPasswordHash(),
                now));
        request.approve(decidedBy, user.getId(), now);
        auditRecorder.record(
                decidedBy,
                "ACCOUNT_REQUEST_APPROVED",
                "ACCOUNT_REQUEST",
                request.getId().toString(),
                "SUCCESS");
        activityRecorder.recordActor(
                "admin",
                null,
                decidedBy,
                "ACCOUNT_REQUEST_APPROVED",
                "ACCOUNT_REQUEST",
                request.getId().toString(),
                null,
                "created_user_id=" + user.getId());
        return user;
    }

    @Transactional
    public ErpAccountRequest reject(long requestId, String decidedBy) {
        ErpAccountRequest request = getPendingForUpdate(requestId);
        request.reject(decidedBy, clock.instant());
        auditRecorder.record(
                decidedBy,
                "ACCOUNT_REQUEST_REJECTED",
                "ACCOUNT_REQUEST",
                request.getId().toString(),
                "SUCCESS");
        activityRecorder.recordActor(
                "admin",
                null,
                decidedBy,
                "ACCOUNT_REQUEST_REJECTED",
                "ACCOUNT_REQUEST",
                request.getId().toString(),
                null,
                "email=" + request.getEmail());
        return request;
    }

    private ErpAccountRequest getPendingForUpdate(long requestId) {
        ErpAccountRequest request = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new AuthExceptions.NotFound("Account request not found"));
        if (request.getStatus() != AccountRequestStatus.PENDING) {
            throw new AuthExceptions.Conflict("Account request has already been decided");
        }
        return request;
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
