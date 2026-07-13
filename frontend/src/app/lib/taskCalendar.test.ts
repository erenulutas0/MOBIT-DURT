import { describe, expect, it } from "vitest";

import { buildTaskAgenda } from "./taskCalendar";

const NOW = new Date("2026-07-12T10:00:00");

function task(id: number, overrides: Partial<Parameters<typeof buildTaskAgenda>[0][number]> = {}) {
  return {
    id,
    title: `Görev ${id}`,
    status: "todo",
    priority: "normal",
    deadline_at: null as string | null,
    ...overrides,
  };
}

describe("buildTaskAgenda", () => {
  it("orders sections as overdue, ascending days, then undated, excluding closed tasks", () => {
    const sections = buildTaskAgenda(
      [
        task(1, { status: "done", deadline_at: "2026-07-13T09:00:00" }),
        task(2, { deadline_at: "2026-07-11T09:00:00" }),
        task(3, { deadline_at: "2026-07-14T16:00:00" }),
        task(4, { deadline_at: "2026-07-14T08:30:00" }),
        task(5, { deadline_at: "2026-07-12T22:00:00" }),
        task(6),
      ],
      NOW
    );
    expect(sections.map(section => section.kind)).toEqual(["overdue", "day", "day", "none"]);
    expect(sections.map(section => section.label)).toEqual(["Gecikmiş", "Bugün", "14 Temmuz Salı", "Tarihsiz"]);
    expect(sections[2].tasks.map(item => item.id)).toEqual([4, 3]);
  });
});
