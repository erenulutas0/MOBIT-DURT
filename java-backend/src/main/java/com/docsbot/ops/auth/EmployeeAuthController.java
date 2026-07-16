package com.docsbot.ops.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.auth.application.EmployeeAuthenticationService;

@RestController
@RequestMapping("/erp/auth")
@Profile("postgres")
public class EmployeeAuthController {

    private final EmployeeAuthenticationService authenticationService;

    public EmployeeAuthController(EmployeeAuthenticationService authenticationService) {
        this.authenticationService = authenticationService;
    }

    @PostMapping("/login")
    AuthSessionResponse login(@Valid @RequestBody EmployeeLoginRequest request) {
        return authenticationService.login(request.email(), request.password());
    }

    @PostMapping("/register")
    AuthSessionResponse register(@Valid @RequestBody EmployeeRegisterRequest request) {
        return authenticationService.register(
                request.name(),
                request.username(),
                request.email(),
                request.phone(),
                request.password());
    }

    // The field is named `email` for backward compatibility with existing clients, but it now holds
    // an identifier that may be either a username or an email — hence no @Email constraint.
    record EmployeeLoginRequest(
            @NotBlank @Size(max = 255) String email,
            @NotBlank @Size(max = 128) String password
    ) {
    }

    // Email and phone are optional contact fields; only a username + password are required.
    record EmployeeRegisterRequest(
            @NotBlank @Size(max = 255) String name,
            @NotBlank @Size(min = 3, max = 64)
            @Pattern(
                    regexp = "^[A-Za-z0-9._-]+$",
                    message = "Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi veya tire içerebilir.")
            String username,
            @Email @Size(max = 255) String email,
            @Size(max = 64) String phone,
            @NotBlank @Size(min = 10, max = 128) String password
    ) {
    }
}
