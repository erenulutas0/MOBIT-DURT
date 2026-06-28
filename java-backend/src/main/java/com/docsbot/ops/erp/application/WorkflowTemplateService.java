package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.ErpWorkflowTemplate;
import com.docsbot.ops.erp.domain.ErpWorkflowTemplateAssignment;
import com.docsbot.ops.erp.domain.TaskPriority;
import com.docsbot.ops.erp.domain.WorkflowRecurrenceType;
import com.docsbot.ops.erp.infrastructure.ErpWorkflowTemplateAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpWorkflowTemplateRepository;

@Service
@Profile("postgres")
public class WorkflowTemplateService {
    private final ErpWorkflowTemplateRepository templateRepository;
    private final ErpWorkflowTemplateAssignmentRepository assignmentRepository;
    private final ErpTaskWorkflowService taskService;
    private final ErpTaskAccessService accessService;
    private final ErpActivityRecorder activityRecorder;
    private final Clock clock;

    @Autowired
    public WorkflowTemplateService(
            ErpWorkflowTemplateRepository templateRepository,
            ErpWorkflowTemplateAssignmentRepository assignmentRepository,
            ErpTaskWorkflowService taskService,
            ErpTaskAccessService accessService,
            ErpActivityRecorder activityRecorder
    ) {
        this(
                templateRepository,
                assignmentRepository,
                taskService,
                accessService,
                activityRecorder,
                Clock.systemUTC());
    }

    WorkflowTemplateService(
            ErpWorkflowTemplateRepository templateRepository,
            ErpWorkflowTemplateAssignmentRepository assignmentRepository,
            ErpTaskWorkflowService taskService,
            ErpTaskAccessService accessService,
            ErpActivityRecorder activityRecorder,
            Clock clock
    ) {
        this.templateRepository = templateRepository;
        this.assignmentRepository = assignmentRepository;
        this.taskService = taskService;
        this.accessService = accessService;
        this.activityRecorder = activityRecorder;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TemplateView> list(ErpPrincipal principal) {
        ErpValidation.requireAdmin(principal);
        List<ErpWorkflowTemplate> templates = templateRepository.findAllByOrderByCreatedAtDescIdDesc();
        Map<Long, List<ErpWorkflowTemplateAssignment>> assignments = assignments(
                templates.stream().map(ErpWorkflowTemplate::getId).toList());
        return templates.stream()
                .map(template -> new TemplateView(template, assignments.getOrDefault(template.getId(), List.of())))
                .toList();
    }

    @Transactional
    public TemplateView create(
            ErpPrincipal principal,
            String name,
            String taskTitle,
            String taskDescription,
            String taskPriority,
            String recurrenceType,
            int recurrenceInterval,
            String recurrenceZone,
            Long deadlineOffsetMinutes,
            Instant nextRunAt,
            Collection<Long> assigneeUserIds,
            Collection<Long> assigneeTeamIds
    ) {
        ErpValidation.requireAdmin(principal);
        int interval = Math.max(1, Math.min(recurrenceInterval, 365));
        String zone = normalizeZone(recurrenceZone);
        if (nextRunAt == null) {
            throw new ErpExceptions.BadRequest("Next run time is required");
        }
        if (deadlineOffsetMinutes != null && deadlineOffsetMinutes <= 0) {
            throw new ErpExceptions.BadRequest("Deadline offset must be greater than zero");
        }
        Set<Long> userIds = new LinkedHashSet<>(assigneeUserIds == null ? List.of() : assigneeUserIds);
        Set<Long> teamIds = new LinkedHashSet<>(assigneeTeamIds == null ? List.of() : assigneeTeamIds);
        if (userIds.isEmpty() && teamIds.isEmpty()) {
            throw new ErpExceptions.BadRequest("At least one template assignee is required");
        }
        accessService.validateTargets(userIds, teamIds);

        Instant now = clock.instant();
        ErpWorkflowTemplate template = templateRepository.saveAndFlush(ErpWorkflowTemplate.create(
                ErpValidation.normalizeTitle(name),
                ErpValidation.normalizeTitle(taskTitle),
                ErpValidation.normalizeOptional(taskDescription),
                ErpValidation.parse(TaskPriority.class, taskPriority, "Unknown task priority"),
                ErpValidation.parse(
                        WorkflowRecurrenceType.class,
                        recurrenceType,
                        "Unknown recurrence type"),
                interval,
                zone,
                deadlineOffsetMinutes,
                nextRunAt,
                principal.displayName(),
                now));
        List<ErpWorkflowTemplateAssignment> createdAssignments = new ArrayList<>();
        userIds.forEach(userId -> createdAssignments.add(
                ErpWorkflowTemplateAssignment.forUser(template.getId(), userId, now)));
        teamIds.forEach(teamId -> createdAssignments.add(
                ErpWorkflowTemplateAssignment.forTeam(template.getId(), teamId, now)));
        assignmentRepository.saveAll(createdAssignments);
        activityRecorder.record(
                principal,
                "WORKFLOW_TEMPLATE_CREATED",
                "WORKFLOW_TEMPLATE",
                template.getId().toString(),
                null,
                "recurrence_type=" + template.getRecurrenceType()
                        + "; recurrence_interval=" + template.getRecurrenceInterval());
        return new TemplateView(template, createdAssignments);
    }

    @Transactional
    public TemplateView setActive(ErpPrincipal principal, long templateId, boolean active) {
        ErpValidation.requireAdmin(principal);
        ErpWorkflowTemplate template = requireTemplate(templateId);
        template.setActive(active, clock.instant());
        activityRecorder.record(
                principal,
                active ? "WORKFLOW_TEMPLATE_ACTIVATED" : "WORKFLOW_TEMPLATE_DEACTIVATED",
                "WORKFLOW_TEMPLATE",
                template.getId().toString(),
                null,
                null);
        return new TemplateView(template, assignments(List.of(templateId)).getOrDefault(templateId, List.of()));
    }

    @Transactional
    public ErpTask runNow(ErpPrincipal principal, long templateId) {
        ErpValidation.requireAdmin(principal);
        ErpWorkflowTemplate template = requireTemplate(templateId);
        Instant scheduledFor = clock.instant();
        ErpTask task = taskService.createTaskFromTemplate(
                template,
                assignments(List.of(templateId)).getOrDefault(templateId, List.of()),
                scheduledFor);
        template.markRun(scheduledFor, clock.instant());
        return task;
    }

    @Scheduled(
            fixedDelayString = "${docsbot.workflow-template-scan-ms:60000}",
            initialDelayString = "${docsbot.workflow-template-initial-delay-ms:20000}")
    @Transactional
    public int processDueTemplates() {
        Instant now = clock.instant();
        List<ErpWorkflowTemplate> due = templateRepository
                .findTop50ByActiveTrueAndNextRunAtLessThanEqualOrderByNextRunAtAscIdAsc(now);
        Map<Long, List<ErpWorkflowTemplateAssignment>> assignments = assignments(
                due.stream().map(ErpWorkflowTemplate::getId).toList());
        int created = 0;
        for (ErpWorkflowTemplate template : due) {
            Instant scheduledFor = template.getNextRunAt();
            ErpTask task = taskService.createTaskFromTemplate(
                    template,
                    assignments.getOrDefault(template.getId(), List.of()),
                    scheduledFor);
            template.markRun(scheduledFor, now);
            if (task != null) {
                created++;
            }
        }
        return created;
    }

    private ErpWorkflowTemplate requireTemplate(long templateId) {
        return templateRepository.findById(templateId)
                .orElseThrow(() -> new ErpExceptions.NotFound("Workflow template not found"));
    }

    private Map<Long, List<ErpWorkflowTemplateAssignment>> assignments(Collection<Long> templateIds) {
        Map<Long, List<ErpWorkflowTemplateAssignment>> grouped = new LinkedHashMap<>();
        if (templateIds == null || templateIds.isEmpty()) {
            return grouped;
        }
        assignmentRepository.findAllByTemplateIdInOrderByIdAsc(templateIds)
                .forEach(assignment -> grouped
                        .computeIfAbsent(assignment.getTemplateId(), ignored -> new ArrayList<>())
                        .add(assignment));
        return grouped;
    }

    private String normalizeZone(String value) {
        String zone = value == null || value.isBlank() ? "Europe/Istanbul" : value.trim();
        try {
            return ZoneId.of(zone).getId();
        } catch (Exception exception) {
            throw new ErpExceptions.BadRequest("Unknown recurrence timezone");
        }
    }

    public record TemplateView(
            ErpWorkflowTemplate template,
            List<ErpWorkflowTemplateAssignment> assignments
    ) {
    }
}
