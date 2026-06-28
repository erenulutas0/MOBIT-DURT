package com.docsbot.ops.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.auth.application.RefreshTokenService;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/auth")
public class AuthSessionController {

    private final RefreshTokenService refreshTokenService;

    public AuthSessionController(RefreshTokenService refreshTokenService) {
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/refresh")
    AuthSessionResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return refreshTokenService.rotate(request.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@Valid @RequestBody RefreshRequest request) {
        refreshTokenService.logout(request.refreshToken());
    }

    record RefreshRequest(@NotBlank @JsonProperty("refresh_token") String refreshToken) {
    }
}
