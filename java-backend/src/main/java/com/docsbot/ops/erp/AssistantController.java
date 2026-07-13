package com.docsbot.ops.erp;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.AssistantService;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.assistant.AssistantChatService;
import com.docsbot.ops.erp.domain.ErpTask;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/assistant")
@Profile("postgres")
public class AssistantController {

    private final AssistantService assistantService;
    private final AssistantChatService assistantChatService;

    public AssistantController(
            AssistantService assistantService,
            AssistantChatService assistantChatService) {
        this.assistantService = assistantService;
        this.assistantChatService = assistantChatService;
    }

    @GetMapping("/briefing")
    BriefingResponse briefing(JwtAuthenticationToken authentication) {
        return BriefingResponse.from(assistantService.briefingFor(ErpPrincipal.from(authentication)));
    }

    @PostMapping("/chat")
    ChatResponse chat(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody ChatRequest request
    ) {
        AssistantChatService.Reply reply = assistantChatService.chat(
                ErpPrincipal.from(authentication), request.message());
        return new ChatResponse(reply.assistantName(), reply.provider(), reply.reply());
    }

    record ChatRequest(@NotBlank @Size(max = 2000) String message) {
    }

    record ChatResponse(
            @JsonProperty("assistant_name") String assistantName,
            @JsonProperty("provider") String provider,
            @JsonProperty("reply") String reply
    ) {
    }

    record BriefingResponse(
            @JsonProperty("assistant_name") String assistantName,
            @JsonProperty("display_name") String displayName,
            @JsonProperty("generated_at") Instant generatedAt,
            @JsonProperty("overdue") List<TaskItem> overdue,
            @JsonProperty("due_today") List<TaskItem> dueToday,
            @JsonProperty("due_this_week") List<TaskItem> dueThisWeek,
            @JsonProperty("ready_to_start") List<TaskItem> readyToStart,
            @JsonProperty("blocked") List<TaskItem> blocked,
            @JsonProperty("unread_messages") long unreadMessages,
            @JsonProperty("unread_notifications") long unreadNotifications
    ) {
        static BriefingResponse from(AssistantService.Briefing briefing) {
            return new BriefingResponse(
                    briefing.assistantName(),
                    briefing.displayName(),
                    briefing.generatedAt(),
                    items(briefing.sections().overdue()),
                    items(briefing.sections().dueToday()),
                    items(briefing.sections().dueThisWeek()),
                    items(briefing.sections().readyToStart()),
                    items(briefing.sections().blocked()),
                    briefing.unreadMessages(),
                    briefing.unreadNotifications());
        }

        private static List<TaskItem> items(List<ErpTask> tasks) {
            return tasks.stream().map(TaskItem::from).toList();
        }
    }

    record TaskItem(
            @JsonProperty("id") long id,
            @JsonProperty("title") String title,
            @JsonProperty("status") String status,
            @JsonProperty("deadline_at") Instant deadlineAt
    ) {
        static TaskItem from(ErpTask task) {
            return new TaskItem(
                    task.getId(),
                    task.getTitle(),
                    task.getStatus().name().toLowerCase(Locale.ROOT),
                    task.getDeadlineAt());
        }
    }
}
