package com.docsbot.ops.common.http;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.docsbot.ops.auth.application.AuthExceptions;
import com.docsbot.ops.erp.application.ErpExceptions;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error ->
                fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return response(
                HttpStatus.BAD_REQUEST,
                "Request validation failed",
                request,
                fieldErrors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> handleConstraintViolation(
            ConstraintViolationException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "Request validation failed",
                request,
                Map.of());
    }

    @ExceptionHandler(AuthExceptions.Conflict.class)
    ResponseEntity<ApiError> handleConflict(
            AuthExceptions.Conflict exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.CONFLICT, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(AuthExceptions.NotFound.class)
    ResponseEntity<ApiError> handleNotFound(
            AuthExceptions.NotFound exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.NOT_FOUND, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(AuthExceptions.Unauthorized.class)
    ResponseEntity<ApiError> handleUnauthorized(
            AuthExceptions.Unauthorized exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.UNAUTHORIZED, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(AuthExceptions.Forbidden.class)
    ResponseEntity<ApiError> handleForbidden(
            AuthExceptions.Forbidden exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.FORBIDDEN, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(AuthExceptions.TooManyRequests.class)
    ResponseEntity<ApiError> handleTooManyRequests(
            AuthExceptions.TooManyRequests exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.TOO_MANY_REQUESTS, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(ErpExceptions.BadRequest.class)
    ResponseEntity<ApiError> handleErpBadRequest(
            ErpExceptions.BadRequest exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.BAD_REQUEST, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(ErpExceptions.Forbidden.class)
    ResponseEntity<ApiError> handleErpForbidden(
            ErpExceptions.Forbidden exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.FORBIDDEN, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(ErpExceptions.NotFound.class)
    ResponseEntity<ApiError> handleErpNotFound(
            ErpExceptions.NotFound exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.NOT_FOUND, exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> handleIllegalArgument(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.BAD_REQUEST, "Invalid request value", request, Map.of());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<ApiError> handleOptimisticLock(
            ObjectOptimisticLockingFailureException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.CONFLICT,
                "The resource changed while it was being updated; reload and try again",
                request,
                Map.of());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> handleUploadSize(
            MaxUploadSizeExceededException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "File exceeds the configured size limit",
                request,
                Map.of());
    }

    /**
     * Malformed or unparseable request body. Unlike most Spring MVC exceptions this one does not
     * implement ErrorResponse, so it needs its own handler or it falls through to the 500 branch —
     * reporting a client's bad JSON as a server failure and logging a stack trace for it.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        log.warn("Rejected unreadable body method={} path={}", request.getMethod(), request.getRequestURI());
        return response(HttpStatus.BAD_REQUEST, "Malformed request body", request, Map.of());
    }

    /**
     * Normal end-of-life for a live stream, not a fault. The notification/message SSE emitters have
     * a 30-minute timeout, and a phone that backgrounds or loses signal drops the connection long
     * before that — both surface here. Logged at DEBUG: these were a steady share of the "error
     * storm", and treating an expected disconnect as a server error hides the real ones.
     */
    @ExceptionHandler({AsyncRequestTimeoutException.class, AsyncRequestNotUsableException.class})
    ResponseEntity<ApiError> handleStreamEnded(Exception exception, HttpServletRequest request) {
        log.debug("Stream ended method={} path={} reason={}",
                request.getMethod(), request.getRequestURI(), exception.getMessage());
        // The response is usually already committed by now, so the body is moot; the point is to
        // keep this out of the error log.
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> handleNoResource(
            NoResourceFoundException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "Resource not found",
                request,
                Map.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
        // Most Spring MVC exceptions (wrong method, unsupported media type, missing parameter…)
        // implement ErrorResponse and already carry the right status. Falling through to the 500
        // branch reported them as server failures AND logged a stack trace for each — so every
        // stray probe against an internet-facing host produced an ERROR, which is what turned the
        // uptime monitor's own 3-try GET into both a permanent red alert and a log "error storm".
        // A client sending a bad request is not a server fault: honour its status, log at WARN.
        // (The ones that do NOT implement ErrorResponse, such as an unreadable body, are handled
        // explicitly above — a new one showing up here as a 500 is the signal to add it.)
        if (exception instanceof ErrorResponse errorResponse) {
            HttpStatus status = HttpStatus.resolve(errorResponse.getStatusCode().value());
            if (status == null) {
                status = HttpStatus.BAD_REQUEST;
            }
            log.warn("Rejected request method={} path={} status={} reason={}",
                    request.getMethod(), request.getRequestURI(), status.value(), exception.getMessage());
            return response(status, status.getReasonPhrase(), request, Map.of());
        }
        log.error("Unhandled request failure method={} path={}", request.getMethod(), request.getRequestURI(), exception);
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Unexpected server error",
                request,
                Map.of());
    }

    private ResponseEntity<ApiError> response(
            HttpStatus status,
            String message,
            HttpServletRequest request,
            Map<String, String> fieldErrors
    ) {
        ApiError body = new ApiError(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI(),
                fieldErrors);
        return ResponseEntity.status(status).body(body);
    }
}
