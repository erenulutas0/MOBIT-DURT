package com.docsbot.ops.erp.application.assistant;

/**
 * Shared safety helpers for any {@link AssistantResponder}. Retrieved content — task titles,
 * message bodies — is USER-CONTROLLED and must never be trusted as formatting or instructions.
 * The rule-based responder uses {@link #inline} so a title with newlines or control characters
 * cannot mangle the chat bubble; a future LLM responder must additionally treat this content as
 * delimited data (never interpolate it into the system prompt) so it cannot inject instructions.
 */
public final class AssistantSafety {

    private AssistantSafety() {
    }

    /**
     * Make a user-controlled string safe to drop inline into a single-line reply fragment: strips
     * control characters (including newlines/tabs), collapses whitespace, trims, and caps length.
     */
    public static String inline(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String cleaned = value
                .replaceAll("[\\p{Cntrl}]+", " ")   // no newlines/tabs/control chars in an inline fragment
                .replaceAll("\\s{2,}", " ")
                .trim();
        if (cleaned.length() > maxLength) {
            return cleaned.substring(0, Math.max(0, maxLength - 1)).trim() + "…";
        }
        return cleaned;
    }

    /** Final guard: cap the assembled reply so no single answer can be unbounded. */
    public static String capReply(String reply, int maxLength) {
        if (reply == null) {
            return "";
        }
        if (reply.length() <= maxLength) {
            return reply;
        }
        return reply.substring(0, Math.max(0, maxLength - 1)).trim() + "…";
    }
}
