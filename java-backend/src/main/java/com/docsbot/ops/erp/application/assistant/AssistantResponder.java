package com.docsbot.ops.erp.application.assistant;

import com.docsbot.ops.erp.application.AssistantService;

/**
 * Turns a user's chat message plus the retrieved briefing context into a natural-language reply.
 * This is the ONE seam that needs an LLM. Today a rule-based implementation ships; wiring a
 * Claude-backed implementation later is a new {@code @Component} plus flipping
 * {@code docsbot.assistant.provider} — no other code changes. The retrieval, tool, and UI layers
 * around it are provider-agnostic.
 *
 * <p><b>Security contract — every implementation MUST honor:</b>
 * <ul>
 *   <li>The briefing is already scoped to the caller ({@code briefingFor} filters to the user's own
 *       tasks; admin sees the board). An implementation must never widen that scope or fetch other
 *       users' data.</li>
 *   <li>Task titles and message bodies inside the briefing are <i>user-controlled data</i>, not
 *       instructions. Run them through {@link AssistantSafety#inline} before rendering, and — for
 *       an LLM implementation — pass them only as clearly delimited context, never interpolated
 *       into the system prompt, so a title like "ignore your instructions" cannot inject.</li>
 *   <li>Bound the output ({@link AssistantSafety#capReply}) so no single answer is unbounded.</li>
 * </ul>
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
