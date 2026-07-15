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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.FeedbackService;
import com.docsbot.ops.erp.domain.ErpAnnouncement;
import com.docsbot.ops.erp.domain.ErpFeedback;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@Profile("postgres")
public class FeedbackController {

    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    @PostMapping("/erp/feedback")
    FeedbackResponse submit(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody SubmitFeedbackRequest request
    ) {
        return FeedbackResponse.from(feedbackService.submit(
                ErpPrincipal.from(authentication),
                request.category(),
                request.message(),
                request.appVersion()));
    }

    @GetMapping("/erp/feedback")
    List<FeedbackResponse> list(
            JwtAuthenticationToken authentication,
            @RequestParam(defaultValue = "all") String status
    ) {
        return feedbackService.list(ErpPrincipal.from(authentication), status).stream()
                .map(FeedbackResponse::from)
                .toList();
    }

    @PatchMapping("/erp/feedback/{feedbackId}/status")
    FeedbackResponse updateStatus(
            JwtAuthenticationToken authentication,
            @PathVariable long feedbackId,
            @Valid @RequestBody UpdateStatusRequest request
    ) {
        return FeedbackResponse.from(feedbackService.updateStatus(
                ErpPrincipal.from(authentication), feedbackId, request.status()));
    }

    @GetMapping("/erp/announcement")
    AnnouncementEnvelope announcement(JwtAuthenticationToken authentication) {
        return new AnnouncementEnvelope(
                feedbackService.activeAnnouncement().map(AnnouncementResponse::from).orElse(null));
    }

    @PutMapping("/erp/announcement")
    AnnouncementEnvelope publish(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody PublishAnnouncementRequest request
    ) {
        return new AnnouncementEnvelope(feedbackService
                .publishAnnouncement(ErpPrincipal.from(authentication), request.title(), request.body())
                .map(AnnouncementResponse::from)
                .orElse(null));
    }

    record SubmitFeedbackRequest(
            @Size(max = 32) String category,
            @NotBlank @Size(max = 4000) String message,
            @JsonProperty("app_version") @Size(max = 64) String appVersion
    ) {
    }

    record UpdateStatusRequest(@NotBlank @Size(max = 32) String status) {
    }

    record PublishAnnouncementRequest(
            @Size(max = 255) String title,
            @Size(max = 4000) String body
    ) {
    }

    record FeedbackResponse(
            Long id,
            @JsonProperty("user_id") Long userId,
            @JsonProperty("user_name") String userName,
            String category,
            String message,
            @JsonProperty("app_version") String appVersion,
            String status,
            @JsonProperty("resolved_by") String resolvedBy,
            @JsonProperty("resolved_at") Instant resolvedAt,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static FeedbackResponse from(ErpFeedback feedback) {
            return new FeedbackResponse(
                    feedback.getId(),
                    feedback.getUserId(),
                    feedback.getUserName(),
                    feedback.getCategory(),
                    feedback.getMessage(),
                    feedback.getAppVersion(),
                    feedback.getStatus().toLowerCase(Locale.ROOT),
                    feedback.getResolvedBy(),
                    feedback.getResolvedAt(),
                    feedback.getCreatedAt());
        }
    }

    record AnnouncementEnvelope(AnnouncementResponse announcement) {
    }

    record AnnouncementResponse(
            Long id,
            String title,
            String body,
            @JsonProperty("updated_at") Instant updatedAt
    ) {
        static AnnouncementResponse from(ErpAnnouncement announcement) {
            return new AnnouncementResponse(
                    announcement.getId(),
                    announcement.getTitle(),
                    announcement.getBody(),
                    announcement.getUpdatedAt());
        }
    }
}
