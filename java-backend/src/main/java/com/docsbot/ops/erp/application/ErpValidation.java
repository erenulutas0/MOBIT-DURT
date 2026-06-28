package com.docsbot.ops.erp.application;

import java.util.Locale;

final class ErpValidation {
    private ErpValidation() {
    }

    static void requireAdmin(ErpPrincipal principal) {
        if (!principal.admin()) {
            throw new ErpExceptions.Forbidden("Admin role is required");
        }
    }

    static String normalizeName(String value) {
        String normalized = String.join(" ", value.trim().split("\\s+"));
        if (normalized.length() < 2) {
            throw new ErpExceptions.BadRequest("User name must be at least 2 characters");
        }
        return normalized;
    }

    static String normalizeTitle(String value) {
        String normalized = String.join(" ", value.trim().split("\\s+"));
        if (normalized.length() < 3) {
            throw new ErpExceptions.BadRequest("Task title must be at least 3 characters");
        }
        return normalized;
    }

    static String normalizeEmail(String value) {
        String normalized = normalizeOptional(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    static String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    static String normalizeRequiredMessage(String value) {
        String normalized = normalizeOptional(value);
        if (normalized == null || normalized.length() < 2) {
            throw new ErpExceptions.BadRequest("Message must be at least 2 characters");
        }
        if (normalized.length() > 4_000) {
            throw new ErpExceptions.BadRequest("Message must not exceed 4000 characters");
        }
        return normalized;
    }

    static String normalizeMessage(String value, String fallback) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            return fallback;
        }
        if (normalized.length() > 4_000) {
            throw new ErpExceptions.BadRequest("Message must not exceed 4000 characters");
        }
        return normalized;
    }

    static <E extends Enum<E>> E parse(Class<E> type, String value, String message) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException exception) {
            throw new ErpExceptions.BadRequest(message);
        }
    }
}
