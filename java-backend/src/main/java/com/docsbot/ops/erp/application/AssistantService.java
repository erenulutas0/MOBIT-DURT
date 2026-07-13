package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.domain.ErpDirectMessage;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskStatus;
import com.docsbot.ops.erp.infrastructure.ErpDirectMessageRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskAssignmentRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskDependencyRepository;
import com.docsbot.ops.erp.infrastructure.ErpTaskRepository;
import com.docsbot.ops.erp.infrastructure.ErpTeamMemberRepository;

/**
 * "Mobit-Asistan" — the per-user assistant. It continuously watches each user's workload and
 * surfaces it two ways: an on-demand briefing (the assistant screen calls {@link #briefingFor})
 * and a scheduled morning push summary per user. The real-time "watching" is the existing
 * deadline/SLA scan ladder; the assistant complements it with a consolidated, personal view:
 * what is overdue, what is due today/this week, which tasks just became unblocked, and what is
 * waiting unread. Rule-based by design — no LLM dependency.
 */
@Service
@Profile("postgres")
public class AssistantService {

    public static final String ASSISTANT_NAME = "Mobit-Asistan";
    static final String BRIEFING_TYPE = "assistant_briefing";

    /** Anything not closed is "open" and belongs on the assistant's radar. */
    private static final EnumSet<TaskStatus> OPEN_STATUSES = EnumSet.of(
            TaskStatus.TODO,
            TaskStatus.IN_PROGRESS,
            TaskStatus.BLOCKED,
            TaskStatus.PENDING_APPROVAL,
            TaskStatus.OVERDUE);

    /** A predecessor in one of these states no longer holds its successors back. */
    private static final EnumSet<TaskStatus> RELEASING_STATUSES =
            EnumSet.of(TaskStatus.DONE, TaskStatus.CANCELLED);

    private final ErpTaskRepository taskRepository;
    private final ErpTaskAssignmentRepository assignmentRepository;
    private final ErpTeamMemberRepository teamMemberRepository;
    private final ErpTaskDependencyRepository dependencyRepository;
    private final ErpUserRepository userRepository;
    private final ErpDirectMessageRepository directMessageRepository;
    private final NotificationService notificationService;
    private final ZoneId zone;
    private final Clock clock;

    @Autowired
    public AssistantService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            ErpTaskDependencyRepository dependencyRepository,
            ErpUserRepository userRepository,
            ErpDirectMessageRepository directMessageRepository,
            NotificationService notificationService,
            @Value("${docsbot.assistant.zone:Europe/Istanbul}") String zone
    ) {
        this(taskRepository, assignmentRepository, teamMemberRepository, dependencyRepository,
                userRepository, directMessageRepository, notificationService,
                ZoneId.of(zone), Clock.systemUTC());
    }

    AssistantService(
            ErpTaskRepository taskRepository,
            ErpTaskAssignmentRepository assignmentRepository,
            ErpTeamMemberRepository teamMemberRepository,
            ErpTaskDependencyRepository dependencyRepository,
            ErpUserRepository userRepository,
            ErpDirectMessageRepository directMessageRepository,
            NotificationService notificationService,
            ZoneId zone,
            Clock clock
    ) {
        this.taskRepository = taskRepository;
        this.assignmentRepository = assignmentRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.dependencyRepository = dependencyRepository;
        this.userRepository = userRepository;
        this.directMessageRepository = directMessageRepository;
        this.notificationService = notificationService;
        this.zone = zone;
        this.clock = clock;
    }

    /** The current briefing for the calling principal: admin sees the whole board, a user their own. */
    @Transactional(readOnly = true)
    public Briefing briefingFor(ErpPrincipal principal) {
        Instant now = clock.instant();
        Snapshot snapshot = snapshot(now);
        if (principal.admin()) {
            Sections sections = sections(snapshot, snapshot.openTasks, now);
            long unreadMessages = directMessageRepository
                    .countByRecipientTypeAndReadAtIsNull(ErpDirectMessage.ACTOR_ADMIN);
            return new Briefing(ASSISTANT_NAME, principal.displayName(), now, sections,
                    unreadMessages, notificationService.unreadCount(principal));
        }
        long userId = principal.requireUserId();
        Sections sections = sections(snapshot, tasksAssignedTo(snapshot, userId), now);
        long unreadMessages = directMessageRepository
                .countByRecipientTypeAndRecipientUserIdAndReadAtIsNull(ErpDirectMessage.ACTOR_USER, userId);
        return new Briefing(ASSISTANT_NAME, principal.displayName(), now, sections,
                unreadMessages, notificationService.unreadCount(principal));
    }

    /**
     * Morning briefing push, one per user per day (event-key dedupe makes reruns no-ops).
     * Users with an empty briefing are skipped — the assistant only speaks when it has something.
     */
    @Scheduled(cron = "${docsbot.assistant.briefing-cron:0 30 8 * * MON-FRI}",
            zone = "${docsbot.assistant.briefing-zone:Europe/Istanbul}")
    @Transactional
    public int sendMorningBriefings() {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, zone);
        Snapshot snapshot = snapshot(now);
        int sent = 0;
        for (ErpUser user : userRepository.findAllByOrderByNameAscIdAsc()) {
            Sections sections = sections(snapshot, tasksAssignedTo(snapshot, user.getId()), now);
            long unreadMessages = directMessageRepository
                    .countByRecipientTypeAndRecipientUserIdAndReadAtIsNull(
                            ErpDirectMessage.ACTOR_USER, user.getId());
            if (sections.isEmpty() && unreadMessages == 0) {
                continue;
            }
            sent += notificationService.notifyUsers(
                    List.of(user.getId()),
                    BRIEFING_TYPE,
                    ASSISTANT_NAME + " — Günaydın, " + firstName(user.getName()),
                    summaryLine(sections, unreadMessages),
                    null,
                    sections.overdue().isEmpty() ? "NORMAL" : "HIGH",
                    BRIEFING_TYPE + ":" + today,
                    now);
        }
        return sent;
    }

    // ---- internals -------------------------------------------------------------------------

    /** One pass over the open board, shared by every user's briefing in a run. */
    private Snapshot snapshot(Instant now) {
        List<ErpTask> openTasks = taskRepository.findAllByStatusInOrderByDeadlineAtAscIdAsc(OPEN_STATUSES);
        List<Long> taskIds = openTasks.stream().map(ErpTask::getId).toList();
        Map<Long, Set<Long>> assigneesByTask = TaskAssigneeBatch.assignedUserIdsByTask(
                assignmentRepository, teamMemberRepository, taskIds);

        // Predecessor states for every open task that has dependencies.
        Map<Long, Set<Long>> predecessorsByTask = new LinkedHashMap<>();
        Set<Long> predecessorIds = new LinkedHashSet<>();
        if (!taskIds.isEmpty()) {
            dependencyRepository.findAllBySuccessorTaskIdIn(taskIds).forEach(dependency -> {
                predecessorsByTask
                        .computeIfAbsent(dependency.getSuccessorTaskId(), ignored -> new LinkedHashSet<>())
                        .add(dependency.getPredecessorTaskId());
                predecessorIds.add(dependency.getPredecessorTaskId());
            });
        }
        Map<Long, TaskStatus> predecessorStatus = new LinkedHashMap<>();
        if (!predecessorIds.isEmpty()) {
            taskRepository.findAllByIdInOrderByCreatedAtDescIdDesc(predecessorIds)
                    .forEach(task -> predecessorStatus.put(task.getId(), task.getStatus()));
        }
        return new Snapshot(openTasks, assigneesByTask, predecessorsByTask, predecessorStatus);
    }

    private List<ErpTask> tasksAssignedTo(Snapshot snapshot, long userId) {
        return snapshot.openTasks.stream()
                .filter(task -> snapshot.assigneesByTask
                        .getOrDefault(task.getId(), Set.of())
                        .contains(userId))
                .toList();
    }

    private Sections sections(Snapshot snapshot, List<ErpTask> tasks, Instant now) {
        Instant endOfToday = LocalDate.ofInstant(now, zone).plusDays(1).atStartOfDay(zone).toInstant();
        Instant endOfWeekWindow = endOfToday.plus(java.time.Duration.ofDays(6));

        List<ErpTask> overdue = new ArrayList<>();
        List<ErpTask> dueToday = new ArrayList<>();
        List<ErpTask> dueThisWeek = new ArrayList<>();
        List<ErpTask> readyToStart = new ArrayList<>();
        List<ErpTask> blocked = new ArrayList<>();

        for (ErpTask task : tasks) {
            Instant deadline = task.getDeadlineAt();
            boolean isOverdue = task.getStatus() == TaskStatus.OVERDUE
                    || (deadline != null && deadline.isBefore(now));
            if (isOverdue) {
                overdue.add(task);
            } else if (deadline != null && deadline.isBefore(endOfToday)) {
                dueToday.add(task);
            } else if (deadline != null && deadline.isBefore(endOfWeekWindow)) {
                dueThisWeek.add(task);
            }

            Set<Long> predecessors = snapshot.predecessorsByTask.get(task.getId());
            if (predecessors == null || predecessors.isEmpty()) {
                continue;
            }
            boolean anyHolding = predecessors.stream().anyMatch(predecessorId ->
                    !RELEASING_STATUSES.contains(
                            snapshot.predecessorStatus.getOrDefault(predecessorId, TaskStatus.TODO)));
            if (anyHolding) {
                blocked.add(task);
            } else if (task.getStatus() == TaskStatus.TODO || task.getStatus() == TaskStatus.BLOCKED) {
                // All predecessors released and work has not started: worth a nudge.
                readyToStart.add(task);
            }
        }
        return new Sections(overdue, dueToday, dueThisWeek, readyToStart, blocked);
    }

    private String summaryLine(Sections sections, long unreadMessages) {
        List<String> parts = new ArrayList<>();
        if (!sections.overdue().isEmpty()) {
            parts.add(sections.overdue().size() + " geciken görev");
        }
        if (!sections.dueToday().isEmpty()) {
            parts.add(sections.dueToday().size() + " görev bugün teslim");
        }
        if (!sections.dueThisWeek().isEmpty()) {
            parts.add(sections.dueThisWeek().size() + " görev bu hafta teslim");
        }
        if (!sections.readyToStart().isEmpty()) {
            parts.add(sections.readyToStart().size() + " görevin önü açıldı");
        }
        if (unreadMessages > 0) {
            parts.add(unreadMessages + " okunmamış mesaj");
        }
        return String.join(", ", parts) + ".";
    }

    private static String firstName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "";
        }
        String trimmed = fullName.trim();
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(0, space);
    }

    private record Snapshot(
            List<ErpTask> openTasks,
            Map<Long, Set<Long>> assigneesByTask,
            Map<Long, Set<Long>> predecessorsByTask,
            Map<Long, TaskStatus> predecessorStatus) {
    }

    public record Sections(
            List<ErpTask> overdue,
            List<ErpTask> dueToday,
            List<ErpTask> dueThisWeek,
            List<ErpTask> readyToStart,
            List<ErpTask> blocked) {

        boolean isEmpty() {
            return overdue.isEmpty() && dueToday.isEmpty() && dueThisWeek.isEmpty()
                    && readyToStart.isEmpty() && blocked.isEmpty();
        }
    }

    public record Briefing(
            String assistantName,
            String displayName,
            Instant generatedAt,
            Sections sections,
            long unreadMessages,
            long unreadNotifications) {
    }
}
