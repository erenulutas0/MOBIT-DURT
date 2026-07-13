package com.docsbot.ops.common.logging;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);
    static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String MDC_KEY = "request_id";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        // Correlate every log line for this request. Reuse a caller-supplied id (so a trace can span
        // the reverse proxy / client) when it is well-formed; otherwise mint one. Echoed back so the
        // client can quote it when reporting an error. Lives in the MDC, so the structured logger
        // attaches it to every line — including errors thrown deep in the request.
        String requestId = sanitizeRequestId(request.getHeader(REQUEST_ID_HEADER));
        MDC.put(MDC_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);
        Instant startedAt = Instant.now();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = Duration.between(startedAt, Instant.now()).toMillis();
            log.info(
                    "request_complete method={} path={} status={} duration_ms={} request_id={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    durationMs,
                    requestId);
            MDC.remove(MDC_KEY);
        }
    }

    /** Accept a caller id only if it is short and made of safe token characters; else generate one. */
    private static String sanitizeRequestId(String candidate) {
        if (candidate == null) {
            return UUID.randomUUID().toString();
        }
        String trimmed = candidate.trim();
        if (trimmed.isEmpty() || trimmed.length() > 64 || !trimmed.matches("[A-Za-z0-9._-]+")) {
            return UUID.randomUUID().toString();
        }
        return trimmed;
    }
}
