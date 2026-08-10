package com.docsbot.ops.common.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.Customizer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Configuration
public class SecurityConfig {

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationConverter jwtAuthenticationConverter
    ) throws Exception {
        return http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                // Defense-in-depth. nosniff stops content-type sniffing; the CSP blocks framing
                // (clickjacking) and object/embed plugins without a script restriction — a strict
                // default-src would break the same-origin Swagger UI, and the media stored-XSS
                // vector is already closed at the response level (attachment + nosniff for any
                // non-safe content type) and at upload (active-content types rejected).
                .headers(headers -> headers
                        .contentTypeOptions(Customizer.withDefaults())
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "frame-ancestors 'none'; object-src 'none'; base-uri 'none'")))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(form -> form.disable())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .authenticationEntryPoint(this::writeUnauthorized)
                        .accessDeniedHandler(this::writeForbidden)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(this::writeUnauthorized)
                        .accessDeniedHandler(this::writeForbidden))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/health",
                                "/actuator/health",
                                "/erp/auth/admin-login",
                                "/erp/auth/login",
                                "/erp/auth/register",
                                "/erp/auth/refresh",
                                "/erp/auth/logout",
                                "/webhook/telegram",
                                "/shared/documents/**",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/erp/account-requests")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/erp/account-requests/verify", "/erp/account-requests/resend")
                        .permitAll()
                        .requestMatchers("/erp/account-requests/**")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                "/documents/**",
                                "/tenders/**",
                                "/dashboard/tree",
                                "/dashboard/vault/**",
                                "/dashboard/files/**",
                                "/dashboard/tree-file")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/dashboard/upload")
                        .hasRole("ADMIN")
                        .requestMatchers("/telegram/chats/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/users")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/erp/users/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/tasks")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                "/erp/workflow-templates",
                                "/erp/workflow-templates/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/erp/tasks/bulk/status")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/tasks/bulk/assignees")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/tasks/from-document/*")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/erp/task-documents/*")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/tasks/*/approve-completion",
                                "/erp/tasks/*/reject-completion")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/tasks/*/dependencies")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/erp/tasks/*/dependencies/*")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/tasks/*/document-group")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/teams")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/teams/*/members/*")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/erp/teams/*/members/*")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.GET,
                                "/erp/analytics/summary",
                                "/erp/activity")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/app-update/broadcast")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.GET,
                                "/erp/app-update",
                                "/erp/overview",
                                "/erp/users",
                                "/erp/users/page",
                                "/erp/teams",
                                "/erp/tasks",
                                "/erp/tasks/page",
                                "/erp/tasks/*",
                                "/erp/tasks/*/documents",
                                "/erp/task-documents/*/content")
                        .authenticated()
                        .requestMatchers(
                                "/document-groups",
                                "/document-groups/**")
                        .authenticated()
                        .requestMatchers(HttpMethod.POST, "/erp/users/*/presence")
                        .authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/erp/tasks/*")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/tasks/*/completion-request",
                                "/erp/tasks/*/comments",
                                "/erp/tasks/*/documents")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/erp/notifications",
                                "/erp/notifications/unread-count",
                                "/erp/notifications/stream",
                                "/erp/messages",
                                "/erp/messages/stream",
                                "/erp/messages/*/media",
                                "/erp/notification-preferences",
                                "/erp/web-push/vapid-public-key",
                                "/erp/search",
                                "/erp/company-chat/messages",
                                "/erp/assistant/briefing",
                                "/erp/announcement",
                                "/erp/feedback",
                                "/erp/performance")
                        .authenticated()
                        .requestMatchers(HttpMethod.PUT, "/erp/announcement")
                        .authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/erp/feedback/*/status")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/messages",
                                "/erp/company-chat/messages",
                                "/erp/assistant/chat",
                                "/erp/assistant/speech",
                                "/erp/feedback",
                                "/erp/me/account-deletion-request")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/mobile-push/tokens")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/erp/messages/*",
                                "/erp/mobile-push/tokens")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/erp/web-push/subscriptions")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/erp/web-push/subscriptions")
                        .authenticated()
                        // Resetting someone else's credential is admin-only at the edge as well as in
                        // the service — this one is worth two locks.
                        .requestMatchers(HttpMethod.PATCH, "/erp/users/*/password")
                        .hasRole("ADMIN")
                        // Corpus state and re-indexing are operator controls, not end-user features.
                        .requestMatchers(HttpMethod.GET, "/erp/assistant/documents/status")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/erp/assistant/documents/reindex")
                        .hasRole("ADMIN")
                        // Same lock as /documents/**, which this reads out of. Listing and opening
                        // tender documents has always been admin-only; asking a question that
                        // returns their clauses verbatim is the same access through another door,
                        // and leaving it merely authenticated handed every employee the contents of
                        // an archive they cannot open. If employees should have it, that is a
                        // per-document permission model, not an unlocked search.
                        .requestMatchers(HttpMethod.POST, "/erp/assistant/documents/ask")
                        .hasRole("ADMIN")
                        // The brief quotes the same clauses, so it carries the same lock.
                        .requestMatchers(HttpMethod.GET, "/erp/assistant/tenders/*/brief")
                        .hasRole("ADMIN")
                        // The company's own expiring paperwork: these dates decide whether a bid
                        // can be submitted, and they sit with the rest of the archive behind admin.
                        .requestMatchers("/erp/company-credentials", "/erp/company-credentials/**")
                        .hasRole("ADMIN")
                        // Published tenders, unlike everything above, are a public document: the
                        // Kamu İhale Bülteni is on EKAP's own site for anyone to download. Every
                        // employee can read it. Only pulling it is restricted, because that reaches
                        // out to their servers and one impatient finger should not be able to do so
                        // repeatedly.
                        .requestMatchers(
                                HttpMethod.GET,
                                "/erp/bulletin/notices",
                                "/erp/bulletin/notices/*",
                                "/erp/bulletin/provinces",
                                "/erp/bulletin/categories",
                                // Readable by everyone: what the company watches for is what the
                                // screen filters by, and an employee has to be able to see why
                                // their list is short.
                                "/erp/bulletin/profile")
                        .authenticated()
                        .requestMatchers(HttpMethod.POST, "/erp/bulletin/refresh")
                        .hasRole("ADMIN")
                        // Opening a tender's preparation task is task creation, and task creation
                        // is admin-only everywhere else in this application.
                        .requestMatchers(HttpMethod.POST, "/erp/bulletin/notices/*/task")
                        .hasRole("ADMIN")
                        // Deciding it is another matter: this changes what every employee sees and
                        // what the morning notification says.
                        .requestMatchers(HttpMethod.PUT, "/erp/bulletin/profile")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                HttpMethod.PATCH,
                                "/erp/notifications/*/read",
                                "/erp/notifications/read-all",
                                "/erp/messages/*/read",
                                "/erp/notification-preferences",
                                "/erp/me/password",
                                "/erp/users/*/document-network-visibility",
                                "/erp/users/*/title")
                        .authenticated()
                        .anyRequest()
                        .denyAll())
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @org.springframework.beans.factory.annotation.Value("${DOCSBOT_WEB_ORIGINS:}") String webOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        // Mobile (Capacitor) + local dev origins, plus the production web panel served behind the
        // reverse proxy. Extra origins (e.g. a custom domain) can be added via DOCSBOT_WEB_ORIGINS
        // as a comma-separated list without a code change.
        java.util.List<String> allowedOrigins = new java.util.ArrayList<>(List.of(
                "https://localhost",
                "http://localhost",
                "capacitor://localhost",
                "ionic://localhost",
                "https://84-46-251-95.sslip.io"));
        if (webOrigins != null && !webOrigins.isBlank()) {
            for (String origin : webOrigins.split(",")) {
                String trimmed = origin.trim();
                if (!trimmed.isEmpty() && !allowedOrigins.contains(trimmed)) {
                    allowedOrigins.add(trimmed);
                }
            }
        }
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedOriginPatterns(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "https://localhost:*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Origin"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    JwtEncoder jwtEncoder(DocsBotProperties properties) {
        return NimbusJwtEncoder.withSecretKey(jwtSecret(properties)).build();
    }

    @Bean
    JwtDecoder jwtDecoder(DocsBotProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSecret(properties))
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(properties.jwt().issuer()));
        return decoder;
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("roles");
        authoritiesConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter authenticationConverter = new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
        return authenticationConverter;
    }

    private SecretKey jwtSecret(DocsBotProperties properties) {
        String secret = properties.jwt().secret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("DOCSBOT_JWT_SECRET must contain at least 32 bytes");
        }
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    private void writeUnauthorized(
            HttpServletRequest request,
            HttpServletResponse response,
            Exception exception
    ) throws IOException {
        writeSecurityError(request, response, HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
    }

    private void writeForbidden(
            HttpServletRequest request,
            HttpServletResponse response,
            Exception exception
    ) throws IOException {
        writeSecurityError(request, response, HttpServletResponse.SC_FORBIDDEN, "Forbidden");
    }

    private void writeSecurityError(
            HttpServletRequest request,
            HttpServletResponse response,
            int status,
            String error
    ) throws IOException {
        response.setHeader("WWW-Authenticate", null);
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().printf(
                "{\"timestamp\":\"%s\",\"status\":%d,\"error\":\"%s\",\"message\":\"%s\",\"path\":\"%s\",\"fieldErrors\":{}}",
                Instant.now(),
                status,
                error,
                error,
                request.getRequestURI());
    }
}
