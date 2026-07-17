package com.docsbot.ops.auth;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.auth.application.AccountService;
import com.docsbot.ops.auth.domain.AccountRequestStatus;
import com.docsbot.ops.auth.domain.ErpAccountRequest;
import com.docsbot.ops.auth.domain.ErpUser;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/account-requests")
@Profile("postgres")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @PostMapping
    AccountRequestResponse create(@Valid @RequestBody CreateAccountRequest request) {
        return AccountRequestResponse.from(accountService.createRequest(
                request.name(),
                request.email(),
                request.phone(),
                request.password()));
    }

    @GetMapping
    List<AccountRequestResponse> list(
            @RequestParam(defaultValue = "pending") String status
    ) {
        AccountRequestStatus parsedStatus = AccountRequestStatus.valueOf(
                status.trim().toUpperCase(Locale.ROOT));
        return accountService.list(parsedStatus).stream()
                .map(AccountRequestResponse::from)
                .toList();
    }

    @PostMapping("/verify")
    void verify(@Valid @RequestBody VerifyRequest request) {
        accountService.verifyEmail(request.email(), request.code());
    }

    @PostMapping("/resend")
    void resend(@Valid @RequestBody ResendRequest request) {
        accountService.resendCode(request.email());
    }

    @PostMapping("/{requestId}/approve")
    UserResponse approve(
            @PathVariable long requestId,
            Authentication authentication,
            @RequestBody(required = false) ApproveRequest request
    ) {
        return UserResponse.from(accountService.approve(
                requestId,
                authentication.getName(),
                request == null ? null : request.title()));
    }

    // Optional ünvan assigned at approval time; body itself is optional for older clients.
    record ApproveRequest(@Size(max = 120) String title) {
    }

    @PostMapping("/{requestId}/reject")
    AccountRequestResponse reject(@PathVariable long requestId, Authentication authentication) {
        return AccountRequestResponse.from(accountService.reject(requestId, authentication.getName()));
    }

    record CreateAccountRequest(
            @NotBlank @Size(max = 255) String name,
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 10, max = 128) String password,
            @Size(max = 64) String phone
    ) {
    }

    record VerifyRequest(
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 4, max = 10) String code
    ) {
    }

    record ResendRequest(
            @NotBlank @Email @Size(max = 255) String email
    ) {
    }

    record AccountRequestResponse(
            Long id,
            String name,
            String email,
            String phone,
            String status,
            @JsonProperty("requested_role") String requestedRole,
            @JsonProperty("verification_required") boolean verificationRequired,
            @JsonProperty("decided_by") String decidedBy,
            @JsonProperty("decided_at") Instant decidedAt,
            @JsonProperty("created_user_id") Long createdUserId,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static AccountRequestResponse from(ErpAccountRequest request) {
            return new AccountRequestResponse(
                    request.getId(),
                    request.getName(),
                    request.getEmail(),
                    request.getPhone(),
                    request.getStatus().name().toLowerCase(Locale.ROOT),
                    request.getRequestedRole().name().toLowerCase(Locale.ROOT),
                    !request.isEmailVerified(),
                    request.getDecidedBy(),
                    request.getDecidedAt(),
                    request.getCreatedUserId(),
                    request.getCreatedAt());
        }
    }

    record UserResponse(
            Long id,
            String name,
            String role,
            String status,
            String email,
            String phone,
            @JsonProperty("last_seen_at") Instant lastSeenAt,
            @JsonProperty("approved_at") Instant approvedAt,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static UserResponse from(ErpUser user) {
            return new UserResponse(
                    user.getId(),
                    user.getName(),
                    user.getRole().name().toLowerCase(Locale.ROOT),
                    user.getStatus().name().toLowerCase(Locale.ROOT),
                    user.getEmail(),
                    user.getPhone(),
                    user.getLastSeenAt(),
                    user.getApprovedAt(),
                    user.getCreatedAt());
        }
    }
}
