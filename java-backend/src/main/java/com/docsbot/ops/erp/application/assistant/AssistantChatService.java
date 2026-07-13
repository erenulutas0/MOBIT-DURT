package com.docsbot.ops.erp.application.assistant;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.AssistantService;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;

/**
 * Orchestrates the conversational assistant. It performs retrieval (the per-user briefing) and
 * hands the question + context to the configured {@link AssistantResponder}. Retrieval, tool
 * access, and the chat surface are provider-agnostic; only the responder knows whether the answer
 * came from a rule engine or an LLM. Selecting a provider is a config flip
 * ({@code docsbot.assistant.provider}) — no wiring changes when a Claude responder is added.
 */
@Service
@Profile("postgres")
public class AssistantChatService {

    private static final Logger log = LoggerFactory.getLogger(AssistantChatService.class);

    private final AssistantService assistantService;
    private final AssistantResponder responder;

    public AssistantChatService(
            AssistantService assistantService,
            List<AssistantResponder> responders,
            @Value("${docsbot.assistant.provider:rule-based}") String provider
    ) {
        this.assistantService = assistantService;
        this.responder = responders.stream()
                .filter(r -> r.id().equalsIgnoreCase(provider))
                .findFirst()
                .orElseGet(() -> {
                    AssistantResponder fallback = responders.stream()
                            .filter(r -> "rule-based".equals(r.id()))
                            .findFirst()
                            .orElseThrow(() -> new IllegalStateException(
                                    "No AssistantResponder available (rule-based missing)"));
                    log.warn("assistant provider '{}' not found; falling back to '{}'",
                            provider, fallback.id());
                    return fallback;
                });
        log.info("Assistant chat provider: {}", this.responder.id());
    }

    @Transactional(readOnly = true)
    public Reply chat(ErpPrincipal principal, String message) {
        if (message == null || message.isBlank()) {
            throw new ErpExceptions.BadRequest("Message is required");
        }
        String cleaned = message.trim();
        AssistantService.Briefing briefing = assistantService.briefingFor(principal);
        String reply = responder.respond(cleaned, briefing);
        return new Reply(AssistantService.ASSISTANT_NAME, responder.id(), reply);
    }

    public record Reply(String assistantName, String provider, String reply) {
    }
}
