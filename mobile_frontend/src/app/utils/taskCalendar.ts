export type AgendaTaskLike = {
  id: number;
  title: string;
  status: string;
  priority: string;
  deadline_at: string | null;
};

export type TaskAgendaSection<T extends AgendaTaskLike> = {
  key: string;
  label: string;
  kind: "overdue" | "day" | "none";
  tasks: T[];
};

const CLOSED_STATUSES = new Set(["done", "cancelled"]);

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDeadline(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deadlineTime(task: AgendaTaskLike) {
  const date = parseDeadline(task.deadline_at);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

export function agendaDayLabel(date: Date, now: Date) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - dayStart.getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Yarın";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

/**
 * Groups open tasks into a deadline agenda: one "Gecikmiş" section first
 * (past-deadline or overdue-status tasks), then one section per calendar day
 * ascending, then a trailing "Tarihsiz" section for tasks with no deadline.
 * Done/cancelled tasks are excluded — the agenda is about pending work.
 */
export function buildTaskAgenda<T extends AgendaTaskLike>(
  tasks: T[],
  now: Date = new Date()
): TaskAgendaSection<T>[] {
  const open = tasks.filter(task => !CLOSED_STATUSES.has(task.status));
  const overdue: T[] = [];
  const dated = new Map<string, { date: Date; tasks: T[] }>();
  const undated: T[] = [];

  for (const task of open) {
    const deadline = parseDeadline(task.deadline_at);
    if (!deadline) {
      undated.push(task);
      continue;
    }
    if (task.status === "overdue" || deadline.getTime() < now.getTime()) {
      overdue.push(task);
      continue;
    }
    const key = localDayKey(deadline);
    const bucket = dated.get(key);
    if (bucket) {
      bucket.tasks.push(task);
    } else {
      dated.set(key, { date: deadline, tasks: [task] });
    }
  }

  const sections: TaskAgendaSection<T>[] = [];
  if (overdue.length > 0) {
    sections.push({
      key: "overdue",
      label: "Gecikmiş",
      kind: "overdue",
      tasks: [...overdue].sort((a, b) => deadlineTime(a) - deadlineTime(b)),
    });
  }
  const dayKeys = [...dated.keys()].sort();
  for (const key of dayKeys) {
    const bucket = dated.get(key)!;
    sections.push({
      key,
      label: agendaDayLabel(bucket.date, now),
      kind: "day",
      tasks: bucket.tasks.sort((a, b) => deadlineTime(a) - deadlineTime(b)),
    });
  }
  if (undated.length > 0) {
    sections.push({ key: "no-deadline", label: "Tarihsiz", kind: "none", tasks: undated });
  }
  return sections;
}
