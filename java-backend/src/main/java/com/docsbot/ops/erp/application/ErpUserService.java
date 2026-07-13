package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.application.RefreshTokenService;
import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.domain.UserRole;
import com.docsbot.ops.auth.domain.UserStatus;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.common.page.OffsetLimitPageable;

@Service
@Profile("postgres")
class ErpUserService {
    private final ErpUserRepository userRepository;
    private final NotificationService notificationService;
    private final ErpActivityRecorder activityRecorder;
    private final ErpTaskAccessService accessService;
    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    ErpUserService(
            ErpUserRepository userRepository,
            NotificationService notificationService,
            ErpActivityRecorder activityRecorder,
            ErpTaskAccessService accessService,
            RefreshTokenService refreshTokenService
    ) {
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.activityRecorder = activityRecorder;
        this.accessService = accessService;
        this.refreshTokenService = refreshTokenService;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    List<ErpUser> listUsers(ErpPrincipal principal) {
        if (!principal.admin()) {
            accessService.requireCurrentUser(principal);
        }
        return userRepository.findAllByOrderByNameAscIdAsc();
    }

    @Transactional(readOnly = true)
    ErpService.PageResult<ErpUser> pageUsers(ErpPrincipal principal, int offset, int limit) {
        if (!principal.admin()) {
            accessService.requireCurrentUser(principal);
        }
        var page = userRepository.findAll(new OffsetLimitPageable(
                limit,
                offset,
                Sort.by(Sort.Order.asc("name"), Sort.Order.asc("id"))));
        return new ErpService.PageResult<>(page.getTotalElements(), page.getContent());
    }

    @Transactional
    ErpUser createUser(ErpPrincipal principal, String name, String role, String email, String phone) {
        ErpValidation.requireAdmin(principal);
        String normalizedName = ErpValidation.normalizeName(name);
        UserRole parsedRole = ErpValidation.parse(UserRole.class, role, "Unknown user role");
        String normalizedEmail = ErpValidation.normalizeEmail(email);
        if (normalizedEmail != null && userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ErpExceptions.BadRequest("Email already exists");
        }
        try {
            ErpUser user = userRepository.saveAndFlush(ErpUser.approvedUser(
                    normalizedName,
                    parsedRole,
                    normalizedEmail,
                    ErpValidation.normalizeOptional(phone),
                    clock.instant()));
            activityRecorder.record(
                    principal,
                    "USER_CREATED",
                    "USER",
                    user.getId().toString(),
                    null,
                    "role=" + user.getRole().name().toLowerCase(Locale.ROOT));
            return user;
        } catch (DataIntegrityViolationException exception) {
            throw new ErpExceptions.BadRequest("Email already exists");
        }
    }

    @Transactional
    void deleteUser(ErpPrincipal principal, long userId) {
        ErpValidation.requireAdmin(principal);
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("User not found"));
        notificationService.deleteAllForUser(userId);
        refreshTokenService.revokeAllForUser(userId);
        userRepository.delete(user);
        userRepository.flush();
        activityRecorder.record(
                principal,
                "USER_DELETED",
                "USER",
                String.valueOf(userId),
                null,
                "name=" + user.getName());
    }

    @Transactional
    void requestAccountDeletion(ErpPrincipal principal) {
        if (principal.admin()) {
            throw new ErpExceptions.BadRequest("Admin account deletion must be handled by the system owner");
        }
        long userId = principal.requireUserId();
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("User not found"));
        notificationService.notifyAdmin(
                "account_deletion_request",
                "Hesap silme talebi",
                user.getName() + " hesabının silinmesini talep etti.",
                null,
                "HIGH",
                "account-deletion-request:user:" + userId,
                clock.instant());
        activityRecorder.record(
                principal,
                "ACCOUNT_DELETION_REQUESTED",
                "USER",
                String.valueOf(userId),
                null,
                "email=" + (user.getEmail() == null ? "" : user.getEmail()));
    }

    @Transactional
    ErpUser updatePresence(ErpPrincipal principal, long userId, String status) {
        if (!principal.admin() && principal.requireUserId() != userId) {
            throw new ErpExceptions.Forbidden("Employees can update only their own presence");
        }
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("User not found"));
        user.updatePresence(ErpValidation.parse(UserStatus.class, status, "Unknown user status"), clock.instant());
        activityRecorder.record(
                principal,
                "USER_PRESENCE_UPDATED",
                "USER",
                String.valueOf(userId),
                null,
                "status=" + user.getStatus().name().toLowerCase(Locale.ROOT));
        return user;
    }

    @Transactional
    ErpUser updateDocumentNetworkVisibility(ErpPrincipal principal, long userId, boolean visible) {
        ErpValidation.requireAdmin(principal);
        ErpUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ErpExceptions.NotFound("User not found"));
        user.setDocumentNetworkVisible(visible);
        activityRecorder.record(
                principal,
                "USER_DOCUMENT_NETWORK_VISIBILITY_UPDATED",
                "USER",
                String.valueOf(userId),
                null,
                "document_network_visible=" + visible);
        return user;
    }

    private static <T> List<T> slice(List<T> values, int offset, int limit) {
        if (offset >= values.size()) {
            return List.of();
        }
        int toIndex = Math.min(values.size(), offset + limit);
        return values.subList(offset, toIndex);
    }
}
