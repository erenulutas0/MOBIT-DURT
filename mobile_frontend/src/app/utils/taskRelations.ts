export type RelationTaskLike = {
  id: number;
  title: string;
  status: string;
  parent_task_id?: number | null;
};

export type TaskDependencyLike = {
  predecessor_task_id: number;
  successor_task_id: number;
};

const CLOSED_STATUSES = new Set(["done", "cancelled"]);

export function isOpenTaskStatus(status: string) {
  return !CLOSED_STATUSES.has(status);
}

export function subtasksOf<T extends RelationTaskLike>(tasks: T[], taskId: number): T[] {
  return tasks.filter(task => task.parent_task_id === taskId);
}

export function subtaskProgress(tasks: RelationTaskLike[], taskId: number) {
  const subtasks = subtasksOf(tasks, taskId);
  const done = subtasks.filter(task => task.status === "done").length;
  return { done, total: subtasks.length };
}

/** Tasks this task waits on. Unknown ids (outside the visible set) are skipped. */
export function predecessorsOf<T extends RelationTaskLike>(
  tasks: T[],
  dependencies: TaskDependencyLike[],
  taskId: number
): T[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  return dependencies
    .filter(dependency => dependency.successor_task_id === taskId)
    .map(dependency => byId.get(dependency.predecessor_task_id))
    .filter((task): task is T => Boolean(task));
}

/** Tasks that wait on this task. */
export function successorsOf<T extends RelationTaskLike>(
  tasks: T[],
  dependencies: TaskDependencyLike[],
  taskId: number
): T[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  return dependencies
    .filter(dependency => dependency.predecessor_task_id === taskId)
    .map(dependency => byId.get(dependency.successor_task_id))
    .filter((task): task is T => Boolean(task));
}

export function openPredecessorsOf<T extends RelationTaskLike>(
  tasks: T[],
  dependencies: TaskDependencyLike[],
  taskId: number
): T[] {
  return predecessorsOf(tasks, dependencies, taskId).filter(task => isOpenTaskStatus(task.status));
}

/**
 * Candidate predecessors an admin may pick for a task: open tasks other than
 * the task itself, its existing predecessors, and its own subtasks. The
 * backend still enforces cycle safety; this only pre-filters the obvious.
 */
export function dependencyCandidates<T extends RelationTaskLike>(
  tasks: T[],
  dependencies: TaskDependencyLike[],
  taskId: number
): T[] {
  const existing = new Set(
    dependencies
      .filter(dependency => dependency.successor_task_id === taskId)
      .map(dependency => dependency.predecessor_task_id)
  );
  return tasks.filter(task =>
    task.id !== taskId
    && isOpenTaskStatus(task.status)
    && !existing.has(task.id)
    && task.parent_task_id !== taskId
  );
}
