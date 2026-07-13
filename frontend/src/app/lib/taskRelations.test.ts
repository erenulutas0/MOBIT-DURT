import { describe, expect, it } from "vitest";

import {
  dependencyCandidates,
  openPredecessorsOf,
  predecessorsOf,
  subtaskProgress,
  subtasksOf,
  successorsOf,
} from "./taskRelations";

const TASKS = [
  { id: 1, title: "Ana", status: "in_progress", parent_task_id: null },
  { id: 2, title: "Alt A", status: "done", parent_task_id: 1 },
  { id: 3, title: "Alt B", status: "todo", parent_task_id: 1 },
  { id: 4, title: "Bagimsiz", status: "todo", parent_task_id: null },
  { id: 5, title: "Kapali", status: "cancelled", parent_task_id: null },
];

const DEPS = [
  { predecessor_task_id: 4, successor_task_id: 1 },
  { predecessor_task_id: 2, successor_task_id: 4 },
  { predecessor_task_id: 99, successor_task_id: 1 },
];

describe("taskRelations", () => {
  it("finds subtasks and computes progress", () => {
    expect(subtasksOf(TASKS, 1).map(task => task.id)).toEqual([2, 3]);
    expect(subtaskProgress(TASKS, 1)).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress(TASKS, 4)).toEqual({ done: 0, total: 0 });
  });

  it("resolves predecessors and successors, skipping unknown ids", () => {
    expect(predecessorsOf(TASKS, DEPS, 1).map(task => task.id)).toEqual([4]);
    expect(successorsOf(TASKS, DEPS, 4).map(task => task.id)).toEqual([1]);
    expect(successorsOf(TASKS, DEPS, 2).map(task => task.id)).toEqual([4]);
  });

  it("reports only open predecessors as blocking", () => {
    expect(openPredecessorsOf(TASKS, DEPS, 1).map(task => task.id)).toEqual([4]);
    const closedPredecessor = [{ predecessor_task_id: 5, successor_task_id: 1 }];
    expect(openPredecessorsOf(TASKS, closedPredecessor, 1)).toEqual([]);
  });

  it("filters dependency candidates to open non-self non-subtask tasks", () => {
    const candidates = dependencyCandidates(TASKS, DEPS, 1).map(task => task.id);
    // 4 is already a predecessor, 2/3 are subtasks of 1, 5 is closed, 1 is self.
    expect(candidates).toEqual([]);
    const forTask4 = dependencyCandidates(TASKS, DEPS, 4).map(task => task.id);
    // 2 already predecessor of 4; 1 and 3 are open and eligible; 5 closed.
    expect(forTask4).toEqual([1, 3]);
  });
});
