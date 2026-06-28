package com.docsbot.ops.auth.infrastructure;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.auth.domain.ErpRefreshToken;

public interface ErpRefreshTokenRepository extends JpaRepository<ErpRefreshToken, Long> {

    Optional<ErpRefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("""
            update ErpRefreshToken token
               set token.revokedAt = :revokedAt
             where token.subject = :subject
               and token.revokedAt is null
            """)
    int revokeActiveForSubject(
            @Param("subject") String subject,
            @Param("revokedAt") Instant revokedAt);
}
