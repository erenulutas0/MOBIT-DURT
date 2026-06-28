package com.docsbot.ops.auth;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;

@Service
public class TokenService {

    private final JwtEncoder jwtEncoder;
    private final DocsBotProperties properties;
    private final Clock clock;

    @Autowired
    public TokenService(JwtEncoder jwtEncoder, DocsBotProperties properties) {
        this(jwtEncoder, properties, Clock.systemUTC());
    }

    TokenService(JwtEncoder jwtEncoder, DocsBotProperties properties, Clock clock) {
        this.jwtEncoder = jwtEncoder;
        this.properties = properties;
        this.clock = clock;
    }

    public IssuedToken issue(String subject, String role, String displayName, Long userId, String email) {
        Instant issuedAt = clock.instant();
        long lifetimeMinutes = properties.jwt().accessTokenMinutes();
        Instant expiresAt = issuedAt.plus(lifetimeMinutes, ChronoUnit.MINUTES);

        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(properties.jwt().issuer())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .subject(subject)
                .id(UUID.randomUUID().toString())
                .claim("roles", List.of(role.toUpperCase()))
                .claim("name", displayName);
        if (userId != null) {
            claims.claim("user_id", userId);
        }
        if (email != null) {
            claims.claim("email", email);
        }

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String value = jwtEncoder.encode(JwtEncoderParameters.from(header, claims.build()))
                .getTokenValue();
        return new IssuedToken(value, lifetimeMinutes * 60);
    }

    public record IssuedToken(String value, long expiresInSeconds) {
    }
}
