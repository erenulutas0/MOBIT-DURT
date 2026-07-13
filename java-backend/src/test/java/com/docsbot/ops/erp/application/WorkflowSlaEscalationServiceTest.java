package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskPriority;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowSlaEscalationServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-09T09:00:00Z");
    private static final long TASK_ID = 7L;
    private static final long REFERENCE_ID = 55L;

    private final ErpTaskRepository taskRepository = mock(ErpTaskRepository.class);
    private final ErpActivityEventRepository activityRepository = mock(ErpActivityEventRepository.class);
    private final ErpTaskAssignmentRepository assignmentRepository = mock(ErpTaskAssignmentRepository.class);
    private final ErpTeamMemberRepository teamMemberRepository = mock(ErpTeamMemberRepository.class);
    private final NotificationService notificationService = mock(NotificationService.class);
    private final ErpActivityRecorder activityRecorder = mock(ErpActivityRecorder.class);

    private final WorkflowSlaEscalationService service = new WorkflowSlaEscalationService(
            taskRepository,
            activityRepository,
            assignmentRepository,
            teamMemberRepository,
            notificationService,
            activityRecorder,
            Duration.ofHours(1),
            Duration.ofHours(1),
            WorkflowSlaEscalationService.parseRepeatHours("24,48"),
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void blockedTaskBelowBaseThresholdIsNotEscalated() {
        givenBlockedTaskStuckFor(Duration.ofMinutes(30));

        assertThat(service.processEscalations()).isZero();
        verify(notificationService, never()).notifyAdmin(
                anyString(), anyString(), anyString(), any(), anyString(), anyString(), any());
    }

    @Test
    void blockedTaskPastBaseThresholdFiresRungZeroWithLegacyEventKey() {
        givenBlockedTaskStuckFor(Duration.ofHours(2));

        assertThat(service.processEscalations()).isEqualTo(1);
        verify(notificationService).notifyAdmin(
                eq("task_blocked_escalation"),
                eq("Görev hâlâ bloke"),
                eq("Blocked task"),
                eq(TASK_ID),
                eq("HIGH"),
                eq("sla_blocked:" + TASK_ID + ":" + REFERENCE_ID),
                eq(NOW));
    }

    @Test
    void blockedTaskPastFirstRepeatRungReescalatesAsCritical() {
        givenBlockedTaskStuckFor(Duration.ofHours(30));

        assertThat(service.processEscalations()).isEqualTo(1);
        verify(notificationService).notifyAdmin(
                eq("task_blocked_escalation"),
                eq("Görev hâlâ bloke (yükseltme 1)"),
                eq("Blocked task"),
                eq(TASK_ID),
                eq("CRITICAL"),
                eq("sla_blocked:" + TASK_ID + ":" + REFERENCE_ID + ":r1"),
                eq(NOW));
        verify(notificationService).notifyUsers(
                anyCollection(),
                eq("task_blocked_escalation"),
                eq("Görev hâlâ bloke (yükseltme 1)"),
                eq("Blocked task"),
                eq(TASK_ID),
                eq("CRITICAL"),
                eq("sla_blocked:" + TASK_ID + ":" + REFERENCE_ID + ":r1"),
                eq(NOW));
    }

    @Test
    void blockedTaskFiresOnlyTheHighestCrossedRung() {
        givenBlockedTaskStuckFor(Duration.ofHours(72));

        assertThat(service.processEscalations()).isEqualTo(1);
        verify(notificationService).notifyAdmin(
                anyString(),
                eq("Görev hâlâ bloke (yükseltme 2)"),
                anyString(),
                eq(TASK_ID),
                eq("CRITICAL"),
                eq("sla_blocked:" + TASK_ID + ":" + REFERENCE_ID + ":r2"),
                eq(NOW));
    }

    @Test
    void pendingApprovalPastRepeatRungReescalatesAsCritical() {
        ErpTask task = task(TaskStatus.PENDING_APPROVAL);
        when(taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.BLOCKED))
                .thenReturn(List.of());
        when(taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.PENDING_APPROVAL))
                .thenReturn(List.of(task));
        when(activityRepository.findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc(
                TASK_ID, "TASK_COMPLETION_REQUESTED"))
                .thenReturn(Optional.of(reference("TASK_COMPLETION_REQUESTED", NOW.minus(Duration.ofHours(30)))));
        when(notificationService.notifyAdmin(
                anyString(), anyString(), anyString(), any(), anyString(), anyString(), any()))
                .thenReturn(1);

        assertThat(service.processEscalations()).isEqualTo(1);
        verify(notificationService).notifyAdmin(
                eq("task_completion_approval_escalation"),
                eq("Tamamlanma onayı hâlâ bekliyor (yükseltme 1)"),
                eq("Blocked task"),
                eq(TASK_ID),
                eq("CRITICAL"),
                eq("sla_approval:" + TASK_ID + ":" + REFERENCE_ID + ":r1"),
                eq(NOW));
    }

    @Test
    void emptyRepeatConfigurationKeepsSingleEscalation() {
        WorkflowSlaEscalationService singleRung = new WorkflowSlaEscalationService(
                taskRepository,
                activityRepository,
                assignmentRepository,
                teamMemberRepository,
                notificationService,
                activityRecorder,
                Duration.ofHours(1),
                Duration.ofHours(1),
                WorkflowSlaEscalationService.parseRepeatHours(""),
                Clock.fixed(NOW, ZoneOffset.UTC));
        givenBlockedTaskStuckFor(Duration.ofDays(10));

        assertThat(singleRung.processEscalations()).isEqualTo(1);
        verify(notificationService).notifyAdmin(
                anyString(),
                eq("Görev hâlâ bloke"),
                anyString(),
                eq(TASK_ID),
                eq("HIGH"),
                eq("sla_blocked:" + TASK_ID + ":" + REFERENCE_ID),
                eq(NOW));
    }

    private void givenBlockedTaskStuckFor(Duration stuckFor) {
        ErpTask task = task(TaskStatus.BLOCKED);
        when(taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.BLOCKED))
                .thenReturn(List.of(task));
        when(taskRepository.findAllByStatusOrderByCreatedAtDescIdDesc(TaskStatus.PENDING_APPROVAL))
                .thenReturn(List.of());
        when(activityRepository.findFirstByTaskIdAndEventTypeOrderByCreatedAtDescIdDesc(
                TASK_ID, "TASK_STATUS_CHANGED"))
                .thenReturn(Optional.of(reference("TASK_STATUS_CHANGED", NOW.minus(stuckFor))));
        when(notificationService.notifyAdmin(
                anyString(), anyString(), anyString(), any(), anyString(), anyString(), any()))
                .thenReturn(1);
    }

    private ErpTask task(TaskStatus status) {
        ErpTask task = ErpTask.create(
                "Blocked task",
                null,
                null,
                TaskPriority.NORMAL,
                null,
                NOW.minus(Duration.ofDays(30)));
        ReflectionTestUtils.setField(task, "id", TASK_ID);
        ReflectionTestUtils.setField(task, "status", status);
        return task;
    }

    private ErpActivityEvent reference(String eventType, Instant createdAt) {
        ErpActivityEvent event = ErpActivityEvent.create(
                "system",
                null,
                "workflow-sla",
                eventType,
                "TASK",
                String.valueOf(TASK_ID),
                TASK_ID,
                null,
                createdAt);
        ReflectionTestUtils.setField(event, "id", REFERENCE_ID);
        return event;
    }
}
