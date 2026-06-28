package com.docsbot.ops.auth;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AuthSessionResponse(
        String role,
        String name,
        @JsonProperty("user_id") Long userId,
        String email,
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("token_type") String tokenType,
        @JsonProperty("expires_in") long expiresIn,
        @JsonProperty("refresh_token") String refreshToken,
        @JsonProperty("refresh_expires_in") long refreshExpiresIn
) {
}
