package com.docsbot.ops.erp.application.assistant;

import com.docsbot.ops.erp.application.AssistantService;

/**
 * Turns a user's chat message plus the retrieved briefing context into a natural-language reply.
 * This is the ONE seam that needs an LLM. Today a rule-based implementation ships; wiring a
 * Claude-backed implementation later is a new {@code @Component} plus flipping
 * {@code docsbot.assistant.provider} — no other code changes. The retrieval, tool, and UI layers
 * around it are provider-agnostic.
 */
public interface AssistantResponder {

    /** Stable id selected by {@code docsbot.assistant.provider} (e.g. "rule-based", "claude"). */
    String id();

    /**
     * @param message  the user's raw chat message
     * @param briefing the retrieved, per-user context (assigned tasks by urgency + unread counts)
     * @return the assistant's reply text
     */
    String respond(String message, AssistantService.Briefing briefing);
}
