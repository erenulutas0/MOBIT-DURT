import { describe, expect, it } from "vitest";
import { bossSummaryToSpeech } from "./AssistantPanel";
import type { AssistantBriefing, ERPOverview, ERPUser } from "../api";

function task(id: number, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, status: "todo", ...extra } as never;
}

function briefing(overrides: Partial<AssistantBriefing> = {}): AssistantBriefing {
  return {
    assistant: "Mobit-Asistan",
    user_name: "Eren",
    generated_at: new Date().toISOString(),
    overdue: [],
    due_today: [],
    due_this_week: [],
    ready_to_start: [],
    blocked: [],
    unread_messages: 0,
    unread_notifications: 0,
    ...overrides,
  } as AssistantBriefing;
}

const AHMET = { id: 2, name: "Ahmet Yılmaz", role: "employee" } as ERPUser;
const MERVE = { id: 3, name: "Merve Kaya", role: "employee" } as ERPUser;

function overviewWith(assignments: Array<[number, number]>, tasks: unknown[]): ERPOverview {
  return {
    tasks,
    assignments: assignments.map(([taskId, userId]) => ({ task_id: taskId, assignee_user_id: userId })),
  } as unknown as ERPOverview;
}

describe("bossSummaryToSpeech", () => {
  it("temiz tabloyu kısa ve net söyler", () => {
    const spoken = bossSummaryToSpeech("Eren Ulutaş", briefing(), [], null, []);
    expect(spoken).toContain("Merhaba Eren.");
    expect(spoken).toContain("Bekleyen iş görünmüyor");
    // Patron özeti kısa olmalı: tek tek görev okumaya girmemeli.
    expect(spoken.length).toBeLessThan(400);
  });

  it("gecikmeyi önceliklendirir ve sayıları verir", () => {
    const spoken = bossSummaryToSpeech(
      "Eren",
      briefing({
        overdue: [task(1, "Site yapma"), task(2, "Teklif hazırla")],
        due_today: [task(3, "BEDAŞ dosyası")],
      }),
      [], null, []);
    expect(spoken).toContain("2 tanesi gecikmiş");
    expect(spoken).toContain("Öncelik burada");
    expect(spoken).toContain("Bugün 1 iş");
  });

  it("geciken işin kimde olduğunu isim vererek söyler", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const spoken = bossSummaryToSpeech(
      "Eren",
      briefing({ overdue: [task(1, "Site yapma"), task(2, "Teklif")] }),
      [AHMET, MERVE],
      overviewWith([[1, 2], [2, 2]], [
        task(1, "Site yapma", { deadline_at: past }),
        task(2, "Teklif", { deadline_at: past }),
      ]),
      []);
    expect(spoken).toContain("Ahmet Yılmaz");
  });

  it("birden fazla kişide gecikme varsa en yoğun olanı öne çıkarır", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const spoken = bossSummaryToSpeech(
      "Eren",
      briefing({ overdue: [task(1, "A"), task(2, "B"), task(3, "C")] }),
      [AHMET, MERVE],
      overviewWith([[1, 2], [2, 2], [3, 3]], [
        task(1, "A", { deadline_at: past }),
        task(2, "B", { deadline_at: past }),
        task(3, "C", { deadline_at: past }),
      ]),
      []);
    expect(spoken).toContain("En çok geciken iş Ahmet Yılmaz üzerinde, 2 adet");
    expect(spoken).toContain("2 çalışanda geciken iş var");
  });

  it("her durumda sonraki adımı teklif eder", () => {
    const spoken = bossSummaryToSpeech("Eren", briefing({ overdue: [task(1, "X")] }), [], null, []);
    expect(spoken).toContain("Ekrandan seçim yapabilirsiniz");
  });
});
