package com.docsbot.ops.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.auth.application.AuthAuditRecorder;
import com.docsbot.ops.auth.application.RefreshTokenService;

@RestController
@RequestMapping("/erp/auth")
public class AdminAuthController {

    private final DocsBotProperties properties;
    private final RefreshTokenService refreshTokenService;
    private final AuthAuditRecorder auditRecorder;

    public AdminAuthController(
            DocsBotProperties properties,
            RefreshTokenService refreshTokenService,
            AuthAuditRecorder auditRecorder
    ) {
        this.properties = properties;
        this.refreshTokenService = refreshTokenService;
        this.auditRecorder = auditRecorder;
    }

    @PostMapping("/admin-login")
    ResponseEntity<?> login(@Valid @RequestBody AdminLoginRequest request) {
        DocsBotProperties.Admin admin = properties.admin();
        boolean valid = admin != null
                && constantTimeEquals(request.username(), admin.username())
                && constantTimeEquals(request.password(), admin.password());
        if (!valid) {
            auditRecorder.record(
                    request.username(),
                    "ADMIN_LOGIN",
                    "SESSION",
                    null,
                    "FAILURE");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(java.util.Map.of("detail", "Invalid admin credentials"));
        }

        auditRecorder.record(
                admin.username(),
                "ADMIN_LOGIN",
                "SESSION",
                null,
                "SUCCESS");
        return ResponseEntity.ok(refreshTokenService.issueSession(
                "admin",
                admin.username(),
                "ADMIN",
                admin.displayName(),
                null,
                null));
    }

    private boolean constantTimeEquals(String provided, String expected) {
        if (provided == null || expected == null) {
            return false;
        }
        int difference = provided.length() ^ expected.length();
        int length = Math.max(provided.length(), expected.length());
        for (int index = 0; index < length; index++) {
            char left = index < provided.length() ? provided.charAt(index) : 0;
            char right = index < expected.length() ? expected.charAt(index) : 0;
            difference |= left ^ right;
        }
        return difference == 0;
    }

    record AdminLoginRequest(
            @NotBlank String username,
            @NotBlank String password
    ) {
    }
}
