import { describe, expect, it } from "vitest";

import { reconcileNewestWindow } from "./messageReconcile";

type Msg = { id: number };

describe("reconcileNewestWindow", () => {
  it("keeps older loaded history that the poll window did not fetch", () => {
    // User scrolled up: ids 1..5 loaded. Poll returns only the newest window 3..5.
    const current: Msg[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const incoming: Msg[] = [{ id: 3 }, { id: 4 }, { id: 5 }];
    expect(reconcileNewestWindow(current, incoming).map(m => m.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds newly arrived messages from the poll", () => {
    const current: Msg[] = [{ id: 3 }, { id: 4 }];
    const incoming: Msg[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
    expect(reconcileNewestWindow(current, incoming).map(m => m.id)).toEqual([3, 4, 5, 6]);
  });

  it("drops a message deleted within the poll window but keeps older ones", () => {
    // id 4 was deleted by another client → absent from the poll window (3..6); id 1 is older, kept.
    const current: Msg[] = [{ id: 1 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const incoming: Msg[] = [{ id: 3 }, { id: 5 }, { id: 6 }];
    expect(reconcileNewestWindow(current, incoming).map(m => m.id)).toEqual([1, 3, 5, 6]);
  });

  it("returns current unchanged when the poll is empty", () => {
    const current: Msg[] = [{ id: 1 }, { id: 2 }];
    expect(reconcileNewestWindow(current, [])).toBe(current);
  });

  it("prefers the incoming copy of a message (updated read state, etc.)", () => {
    const current = [{ id: 1, read: false }];
    const incoming = [{ id: 1, read: true }];
    expect(reconcileNewestWindow(current, incoming)).toEqual([{ id: 1, read: true }]);
  });
});
