import { describe, expect, it } from "vitest";

import { agendaDayLabel, buildTaskAgenda } from "./taskCalendar";

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
  it("excludes done and cancelled tasks", () => {
    const sections = buildTaskAgenda(
      [
        task(1, { status: "done", deadline_at: "2026-07-13T09:00:00" }),
        task(2, { status: "cancelled", deadline_at: "2026-07-13T11:00:00" }),
      ],
      NOW
    );
    expect(sections).toEqual([]);
  });

  it("puts past-deadline and overdue-status tasks into a leading Gecikmiş section", () => {
    const sections = buildTaskAgenda(
      [
        task(1, { deadline_at: "2026-07-11T09:00:00" }),
        task(2, { status: "overdue", deadline_at: "2026-07-10T09:00:00" }),
        task(3, { deadline_at: "2026-07-13T09:00:00" }),
      ],
      NOW
    );
    expect(sections[0].kind).toBe("overdue");
    expect(sections[0].label).toBe("Gecikmiş");
    expect(sections[0].tasks.map(item => item.id)).toEqual([2, 1]);
  });

  it("groups upcoming tasks by day ascending and sorts within a day by time", () => {
    const sections = buildTaskAgenda(
      [
        task(1, { deadline_at: "2026-07-14T16:00:00" }),
        task(2, { deadline_at: "2026-07-13T09:00:00" }),
        task(3, { deadline_at: "2026-07-14T08:30:00" }),
      ],
      NOW
    );
    expect(sections.map(section => section.key)).toEqual(["2026-07-13", "2026-07-14"]);
    expect(sections[1].tasks.map(item => item.id)).toEqual([3, 1]);
  });

  it("labels today and tomorrow specially and keeps undated tasks in a trailing section", () => {
    const sections = buildTaskAgenda(
      [
        task(1, { deadline_at: "2026-07-12T22:00:00" }),
        task(2, { deadline_at: "2026-07-13T09:00:00" }),
        task(3),
      ],
      NOW
    );
    expect(sections.map(section => section.label)).toEqual(["Bugün", "Yarın", "Tarihsiz"]);
    expect(sections[2].kind).toBe("none");
    expect(sections[2].tasks.map(item => item.id)).toEqual([3]);
  });

  it("treats an invalid deadline string as undated", () => {
    const sections = buildTaskAgenda([task(1, { deadline_at: "not-a-date" })], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe("none");
  });
});

describe("agendaDayLabel", () => {
  it("formats other days with weekday and appends the year only when it differs", () => {
    expect(agendaDayLabel(new Date("2026-07-15T09:00:00"), NOW)).toMatch(/15 Temmuz/);
    expect(agendaDayLabel(new Date("2026-07-15T09:00:00"), NOW)).not.toMatch(/2026/);
    expect(agendaDayLabel(new Date("2027-01-05T09:00:00"), NOW)).toMatch(/2027/);
  });
});
