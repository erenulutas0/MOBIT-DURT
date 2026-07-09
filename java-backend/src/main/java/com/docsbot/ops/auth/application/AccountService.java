package com.docsbot.ops.auth.application;

import java.time.Clock;
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
    private final Clock clock;

    @Autowired
    public AccountService(
            ErpAccountRequestRepository requestRepository,
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthAuditRecorder auditRecorder,
            ErpActivityRecorder activityRecorder,
            NotificationService notificationService
    ) {
        this(requestRepository, userRepository, passwordEncoder, auditRecorder, activityRecorder, notificationService, Clock.systemUTC());
    }

    AccountService(
            ErpAccountRequestRepository requestRepository,
            ErpUserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthAuditRecorder auditRecorder,
            ErpActivityRecorder activityRecorder,
            NotificationService notificationService,
            Clock clock
    ) {
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditRecorder = auditRecorder;
        this.activityRecorder = activityRecorder;
        this.notificationService = notificationService;
        this.clock = clock;
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
        try {
            ErpAccountRequest saved = requestRepository.saveAndFlush(request);
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

    @Transactional(readOnly = true)
    public List<ErpAccountRequest> list(AccountRequestStatus status) {
        return requestRepository.findAllByStatusOrderByCreatedAtDescIdDesc(status);
    }

    @Transactional
    public ErpUser approve(long requestId, String decidedBy) {
        ErpAccountRequest request = getPendingForUpdate(requestId);
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
