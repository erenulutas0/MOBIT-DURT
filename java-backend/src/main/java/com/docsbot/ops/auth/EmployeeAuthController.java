package com.docsbot.ops.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
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

    record EmployeeLoginRequest(
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(max = 128) String password
    ) {
    }
}
