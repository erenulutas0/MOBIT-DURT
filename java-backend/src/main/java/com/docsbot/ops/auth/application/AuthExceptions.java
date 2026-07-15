package com.docsbot.ops.auth.application;

public final class AuthExceptions {

    private AuthExceptions() {
    }

    public static class Conflict extends RuntimeException {
        public Conflict(String message) {
            super(message);
        }
    }

    public static class NotFound extends RuntimeException {
        public NotFound(String message) {
            super(message);
        }
    }

    public static class Unauthorized extends RuntimeException {
        public Unauthorized(String message) {
            super(message);
        }
    }

    public static class TooManyRequests extends RuntimeException {
        public TooManyRequests(String message) {
            super(message);
        }
    }
}
