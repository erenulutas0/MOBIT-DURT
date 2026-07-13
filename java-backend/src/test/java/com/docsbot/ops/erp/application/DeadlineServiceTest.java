package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskPriority;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeadlineServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-09T09:00:00Z");

    private final ErpTaskRepository taskRepository = mock(ErpTaskRepository.class);
    private final ErpTaskAssignmentRepository assignmentRepository = mock(ErpTaskAssignmentRepository.class);
    private final ErpTeamMemberRepository teamMemberRepository = mock(ErpTeamMemberRepository.class);
    private final NotificationService notificationService = mock(NotificationService.class);
    private final ErpActivityRecorder activityRecorder = mock(ErpActivityRecorder.class);

    private final DeadlineService service = new DeadlineService(
            taskRepository,
            assignmentRepository,
            teamMemberRepository,
            notificationService,
            activityRecorder,
            DeadlineService.parseThresholdHours("72,48,24,12,6,1"),
            ZoneId.of("Europe/Istanbul"),
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void dueSoonFiresOnlyTheNearestCrossedThresholdWithMatchingUrgency() {
        assertDueSoonAlert(Duration.ofHours(30), "48h", "NORMAL");
        assertDueSoonAlert(Duration.ofHours(10), "12h", "HIGH");
        assertDueSoonAlert(Duration.ofMinutes(30), "1h", "CRITICAL");
    }

    @Test
    void dueSoonFiresExactlyOnThresholdBoundary() {
        assertDueSoonAlert(Duration.ofHours(24), "24h", "HIGH");
    }

    @Test
    void weeklyAdminDigestAggregatesTasksUnderAnIsoWeekEventKey() {
        ErpTask first = task(1L, "Contract review", NOW.plus(Duration.ofDays(2)));
        ErpTask second = task(2L, "Site inspection", NOW.plus(Duration.ofDays(5)));
        when(taskRepository.findAllByDeadlineAtBetweenAndStatusIn(eq(NOW), eq(NOW.plus(Duration.ofDays(7))), any()))
                .thenReturn(List.of(second, first));
        when(notificationService.notifyAdmin(
                anyString(), anyString(), anyString(), isNull(), anyString(), anyString(), any()))
                .thenReturn(1);

        int created = service.processWeeklyAdminDigest();

        assertThat(created).isEqualTo(1);
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).notifyAdmin(
                eq("manager_weekly_digest"),
                eq("Haftalık termin özeti"),
                bodyCaptor.capture(),
                isNull(),
                eq("NORMAL"),
                keyCaptor.capture(),
                eq(NOW));
        assertThat(bodyCaptor.getValue()).startsWith("Önümüzdeki 7 gün içinde termini dolan 2 görev: Contract review");
        // 2026-07-09 is in ISO week 28 of 2026.
        assertThat(keyCaptor.getValue()).isEqualTo("admin_week_digest:2026-W28");
    }

    @Test
    void weeklyAdminDigestIsSilentWhenNothingIsDue() {
        when(taskRepository.findAllByDeadlineAtBetweenAndStatusIn(any(), any(), any()))
                .thenReturn(List.of());

        assertThat(service.processWeeklyAdminDigest()).isZero();
    }

    private void assertDueSoonAlert(Duration remaining, String expectedThresholdLabel, String expectedUrgency) {
        org.mockito.Mockito.reset(taskRepository, notificationService);
        ErpTask task = task(7L, "Example task", NOW.plus(remaining));
        when(taskRepository.findAllByDeadlineAtBetweenAndStatusIn(eq(NOW), eq(NOW.plus(Duration.ofHours(72))), any()))
                .thenReturn(List.of(task));
        when(notificationService.notifyUsers(
                anyCollection(), anyString(), anyString(), anyString(), any(), anyString(), anyString(), any()))
                .thenReturn(1);

        int changed = service.processDueSoonTasks();

        assertThat(changed).isEqualTo(1);
        verify(notificationService).notifyUsers(
                anyCollection(),
                eq("task_due_soon"),
                eq("Görev termini yaklaşıyor"),
                eq("Example task"),
                eq(7L),
                eq(expectedUrgency),
                eq("task_due_soon:7:" + expectedThresholdLabel),
                eq(NOW));
        verify(notificationService).notifyAdmin(
                eq("manager_due_soon_digest"),
                eq("Görev termini yaklaşıyor"),
                eq("Example task"),
                eq(7L),
                eq("NORMAL"),
                eq("manager_due_soon:7:" + expectedThresholdLabel),
                eq(NOW));
    }

    private ErpTask task(long id, String title, Instant deadlineAt) {
        ErpTask task = ErpTask.create(title, null, null, TaskPriority.NORMAL, deadlineAt, NOW.minus(Duration.ofDays(1)));
        ReflectionTestUtils.setField(task, "id", id);
        return task;
    }
}
