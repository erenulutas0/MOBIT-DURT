package com.docsbot.ops.common.http;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final String TOO_MANY_REQUESTS_MESSAGE =
            "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.";

    private final RateLimitProperties properties;
    private final Map<String, WindowCounter> counters = new ConcurrentHashMap<>();
    private final AtomicLong cleanupCursor = new AtomicLong();

    public RateLimitFilter(RateLimitProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Rule rule = ruleFor(request);
        if (rule == null || !properties.isEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        long now = System.currentTimeMillis();
        String key = rule.name() + ":" + clientKey(request);
        WindowCounter counter = counters.computeIfAbsent(key, ignored -> new WindowCounter(now));
        RateLimitDecision decision = counter.tryAcquire(rule, now);
        response.setHeader("X-RateLimit-Limit", String.valueOf(rule.limit()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, decision.remaining())));
        cleanupOccasionally(now);

        if (decision.allowed()) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("""
                {"timestamp":"%s","status":429,"error":"Too Many Requests","message":"%s","path":"%s","fieldErrors":{}}
                """.formatted(Instant.now(), TOO_MANY_REQUESTS_MESSAGE, request.getRequestURI()));
    }

    private Rule ruleFor(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return null;
        }
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
        if (path.equals("/erp/auth/admin-login")
                || path.equals("/erp/auth/login")
                || path.equals("/erp/auth/refresh")) {
            return Rule.of("auth", properties.getAuthLimit(), properties.getAuthWindowSeconds());
        }
        if (path.equals("/erp/account-requests")) {
            return Rule.of(
                    "account-request",
                    properties.getAccountRequestLimit(),
                    properties.getAccountRequestWindowSeconds());
        }
        if (path.equals("/erp/messages") || path.matches("^/document-groups/\\d+/messages$")) {
            return Rule.of("message", properties.getMessageLimit(), properties.getMessageWindowSeconds());
        }
        if (path.equals("/dashboard/upload")
                || path.matches("^/erp/tasks/\\d+/documents$")
                || path.matches("^/document-groups/\\d+/documents$")
                || path.matches("^/document-groups/\\d+/documents/\\d+/versions$")) {
            return Rule.of("upload", properties.getUploadLimit(), properties.getUploadWindowSeconds());
        }
        return null;
    }

    private String clientKey(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private void cleanupOccasionally(long now) {
        if (cleanupCursor.incrementAndGet() % 512 != 0) {
            return;
        }
        counters.entrySet().removeIf(entry -> now - entry.getValue().windowStartedAtMs > 10 * 60_000L);
    }

    private record Rule(String name, int limit, int windowSeconds) {
        static Rule of(String name, int limit, int windowSeconds) {
            return new Rule(name, Math.max(1, limit), Math.max(1, windowSeconds));
        }

        long windowMillis() {
            return windowSeconds * 1_000L;
        }
    }

    private record RateLimitDecision(boolean allowed, int remaining, long retryAfterSeconds) {
    }

    private static final class WindowCounter {
        private long windowStartedAtMs;
        private int count;

        private WindowCounter(long windowStartedAtMs) {
            this.windowStartedAtMs = windowStartedAtMs;
        }

        private synchronized RateLimitDecision tryAcquire(Rule rule, long now) {
            long windowMillis = rule.windowMillis();
            if (now - windowStartedAtMs >= windowMillis) {
                windowStartedAtMs = now;
                count = 0;
            }
            if (count >= rule.limit()) {
                long retryAfterMs = Math.max(1L, windowMillis - (now - windowStartedAtMs));
                return new RateLimitDecision(false, 0, (long) Math.ceil(retryAfterMs / 1_000.0));
            }
            count++;
            return new RateLimitDecision(true, rule.limit() - count, 0);
        }
    }
}
