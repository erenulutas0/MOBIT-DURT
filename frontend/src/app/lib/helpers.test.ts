import { afterEach, describe, expect, it, vi } from "vitest";

import type { ERPNotification, ERPOverview } from "../api";
import {
  mergeNotification,
  notificationUrgency,
  overdueEmployeeRows,
  relativeTime,
  shortName,
  taskLabel,
  userTaskIds,
} from "./helpers";

function notification(id: number, createdAt: string, extra: Partial<ERPNotification> = {}): ERPNotification {
  return {
    id,
    user_id: 1,
    type: "task_due_soon",
    title: `Notification ${id}`,
    body: null,
    read_at: null,
    created_at: createdAt,
    ...extra,
  };
}

describe("notificationUrgency", () => {
  it("maps backend priorities onto the three urgency tiers", () => {
    expect(notificationUrgency("CRITICAL")).toBe("critical");
    expect(notificationUrgency("URGENT")).toBe("critical");
    expect(notificationUrgency("critical")).toBe("critical");
    expect(notificationUrgency("HIGH")).toBe("high");
    expect(notificationUrgency("NORMAL")).toBe("normal");
    expect(notificationUrgency("anything-else")).toBe("normal");
    expect(notificationUrgency(null)).toBe("normal");
    expect(notificationUrgency(undefined)).toBe("normal");
  });
});

describe("mergeNotification", () => {
  it("prepends new notifications and keeps newest-first order", () => {
    const items = [notification(1, "2026-07-09T10:00:00Z")];
    const merged = mergeNotification(items, notification(2, "2026-07-09T11:00:00Z"));
    expect(merged.map((item) => item.id)).toEqual([2, 1]);
  });

  it("updates an existing notification in place instead of duplicating it", () => {
    const items = [notification(1, "2026-07-09T10:00:00Z")];
    const merged = mergeNotification(items, notification(1, "2026-07-09T10:00:00Z", { read_at: "2026-07-09T12:00:00Z" }));
    expect(merged).toHaveLength(1);
    expect(merged[0].read_at).toBe("2026-07-09T12:00:00Z");
  });

  it("caps the list at 50 entries, dropping the oldest", () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      notification(index + 1, `2026-07-08T${String(Math.min(23, index)).padStart(2, "0")}:00:00Z`)
    );
    const merged = mergeNotification(items, notification(999, "2026-07-09T09:00:00Z"));
    expect(merged).toHaveLength(50);
    expect(merged[0].id).toBe(999);
  });
});

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("formats Turkish relative times from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T12:00:00Z"));
    expect(relativeTime("2026-07-09T11:59:45Z")).toBe("şimdi");
    expect(relativeTime("2026-07-09T11:30:00Z")).toBe("30 dk önce");
    expect(relativeTime("2026-07-09T07:00:00Z")).toBe("5 sa önce");
    expect(relativeTime("2026-07-06T12:00:00Z")).toBe("3 gün önce");
    expect(relativeTime(null)).toBe("-");
  });
});

describe("formatting helpers", () => {
  it("builds initials and maps status labels", () => {
    expect(shortName("Ayşe Demir")).toBe("AD");
    expect(shortName("Mono")).toBe("M");
    expect(taskLabel("todo")).toBe("Yapılacak");
    expect(taskLabel("overdue")).toBe("Gecikmiş");
    expect(taskLabel("unknown_status")).toBe("unknown_status");
  });
});

describe("overview selectors", () => {
  const overview = {
    users: [
      { id: 10, name: "Ayşe", role: "EMPLOYEE" },
      { id: 11, name: "Can", role: "EMPLOYEE" },
    ],
    tasks: [
      { id: 1, status: "overdue", deadline_at: "2026-07-01T00:00:00Z" },
      { id: 2, status: "overdue", deadline_at: "2026-06-01T00:00:00Z" },
      { id: 3, status: "todo", deadline_at: null },
    ],
    assignments: [
      { task_id: 1, assignee_user_id: 10 },
      { task_id: 2, assignee_user_id: 10 },
      { task_id: 3, assignee_user_id: 11 },
      { task_id: 2, assignee_user_id: null, assignee_team_id: 5 },
    ],
  } as unknown as ERPOverview;

  it("collects task ids assigned to a user", () => {
    expect(userTaskIds(overview, 10)).toEqual(new Set([1, 2]));
    expect(userTaskIds(overview, 99)).toEqual(new Set());
    expect(userTaskIds(null, 10)).toEqual(new Set());
  });

  it("ranks employees by overdue tasks, earliest deadline first", () => {
    const rows = overdueEmployeeRows(overview);
    const ayse = rows.find((row) => row.user.id === 10);
    expect(ayse?.tasks.map((task) => task.id)).toEqual([2, 1]);
    const can = rows.find((row) => row.user.id === 11);
    expect(can?.tasks ?? []).toHaveLength(0);
  });
});
