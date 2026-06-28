package com.docsbot.ops.erp;

import java.time.Instant;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.WorkflowTemplateService;
import com.docsbot.ops.erp.domain.ErpWorkflowTemplateAssignment;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/workflow-templates")
@Profile("postgres")
public class WorkflowTemplateController {
    private final WorkflowTemplateService service;

    public WorkflowTemplateController(WorkflowTemplateService service) {
        this.service = service;
    }

    @GetMapping
    List<WorkflowTemplateResponse> templates(JwtAuthenticationToken authentication) {
        return service.list(ErpPrincipal.from(authentication)).stream()
                .map(WorkflowTemplateResponse::from)
                .toList();
    }

    @PostMapping
    WorkflowTemplateResponse create(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateWorkflowTemplateRequest request
    ) {
        return WorkflowTemplateResponse.from(service.create(
                ErpPrincipal.from(authentication),
                request.name(),
                request.taskTitle(),
                request.taskDescription(),
                request.taskPriority(),
                request.recurrenceType(),
                request.recurrenceInterval(),
                request.recurrenceZone(),
                request.deadlineOffsetMinutes(),
                request.nextRunAt(),
                request.assigneeUserIds(),
                request.assigneeTeamIds()));
    }

    @PatchMapping("/{templateId}/active")
    WorkflowTemplateResponse setActive(
            JwtAuthenticationToken authentication,
            @PathVariable long templateId,
            @RequestBody ActiveRequest request
    ) {
        return WorkflowTemplateResponse.from(service.setActive(
                ErpPrincipal.from(authentication),
                templateId,
                request.active()));
    }

    @PostMapping("/{templateId}/run")
    ErpDtos.TaskResponse run(
            JwtAuthenticationToken authentication,
            @PathVariable long templateId
    ) {
        return ErpDtos.TaskResponse.from(service.runNow(
                ErpPrincipal.from(authentication),
                templateId));
    }

    record CreateWorkflowTemplateRequest(
            @NotBlank @Size(min = 2, max = 255) String name,
            @JsonProperty("task_title") @NotBlank @Size(min = 3, max = 255) String taskTitle,
            @JsonProperty("task_description") @Size(max = 10_000) String taskDescription,
            @JsonProperty("task_priority") String taskPriority,
            @JsonProperty("recurrence_type") @NotBlank String recurrenceType,
            @JsonProperty("recurrence_interval") @Min(1) @Max(365) int recurrenceInterval,
            @JsonProperty("recurrence_zone") String recurrenceZone,
            @JsonProperty("deadline_offset_minutes") Long deadlineOffsetMinutes,
            @JsonProperty("next_run_at") Instant nextRunAt,
            @JsonProperty("assignee_user_ids") List<Long> assigneeUserIds,
            @JsonProperty("assignee_team_ids") List<Long> assigneeTeamIds
    ) {
        CreateWorkflowTemplateRequest {
            taskPriority = taskPriority == null || taskPriority.isBlank() ? "normal" : taskPriority;
            recurrenceInterval = recurrenceInterval == 0 ? 1 : recurrenceInterval;
            assigneeUserIds = assigneeUserIds == null ? List.of() : List.copyOf(assigneeUserIds);
            assigneeTeamIds = assigneeTeamIds == null ? List.of() : List.copyOf(assigneeTeamIds);
        }
    }

    record ActiveRequest(boolean active) {
    }

    record AssignmentResponse(
            @JsonProperty("assignee_user_id") Long assigneeUserId,
            @JsonProperty("assignee_team_id") Long assigneeTeamId
    ) {
        static AssignmentResponse from(ErpWorkflowTemplateAssignment assignment) {
            return new AssignmentResponse(
                    assignment.getAssigneeUserId(),
                    assignment.getAssigneeTeamId());
        }
    }

    record WorkflowTemplateResponse(
            Long id,
            String name,
            @JsonProperty("task_title") String taskTitle,
            @JsonProperty("task_description") String taskDescription,
            @JsonProperty("task_priority") String taskPriority,
            @JsonProperty("recurrence_type") String recurrenceType,
            @JsonProperty("recurrence_interval") int recurrenceInterval,
            @JsonProperty("recurrence_zone") String recurrenceZone,
            @JsonProperty("deadline_offset_minutes") Long deadlineOffsetMinutes,
            @JsonProperty("next_run_at") Instant nextRunAt,
            @JsonProperty("last_run_at") Instant lastRunAt,
            boolean active,
            @JsonProperty("created_by") String createdBy,
            List<AssignmentResponse> assignments,
            @JsonProperty("created_at") Instant createdAt,
            @JsonProperty("updated_at") Instant updatedAt,
            long version
    ) {
        static WorkflowTemplateResponse from(WorkflowTemplateService.TemplateView view) {
            var template = view.template();
            return new WorkflowTemplateResponse(
                    template.getId(),
                    template.getName(),
                    template.getTaskTitle(),
                    template.getTaskDescription(),
                    template.getTaskPriority().name().toLowerCase(),
                    template.getRecurrenceType().name().toLowerCase(),
                    template.getRecurrenceInterval(),
                    template.getRecurrenceZone(),
                    template.getDeadlineOffsetMinutes(),
                    template.getNextRunAt(),
                    template.getLastRunAt(),
                    template.isActive(),
                    template.getCreatedBy(),
                    view.assignments().stream().map(AssignmentResponse::from).toList(),
                    template.getCreatedAt(),
                    template.getUpdatedAt(),
                    template.getVersion());
        }
    }
}
