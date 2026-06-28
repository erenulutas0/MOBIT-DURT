package com.docsbot.ops.erp.application;

import java.util.OptionalLong;

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

public record ErpPrincipal(
        boolean admin,
        OptionalLong userId,
        String subject,
        String displayName
) {

    public static ErpPrincipal from(JwtAuthenticationToken authentication) {
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"));
        Number userId = authentication.getToken().getClaim("user_id");
        String displayName = authentication.getToken().getClaimAsString("name");
        return new ErpPrincipal(
                admin,
                userId == null ? OptionalLong.empty() : OptionalLong.of(userId.longValue()),
                authentication.getName(),
                displayName == null || displayName.isBlank()
                        ? authentication.getName()
                        : displayName);
    }

    public long requireUserId() {
        if (userId.isEmpty()) {
            throw new ErpExceptions.Forbidden("Authenticated employee identity is required");
        }
        return userId.getAsLong();
    }
}
