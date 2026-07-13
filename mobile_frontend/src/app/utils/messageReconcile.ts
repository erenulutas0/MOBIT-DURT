/**
 * Reconcile a poll of the newest-N messages against what's already loaded WITHOUT
 * discarding older history the user pulled in via "load older".
 *
 * `incoming` is authoritative only for its own id window: messages older than the
 * window's lowest id are kept as-is (the poll didn't fetch them), while within the window
 * `incoming` is the source of truth — a message deleted by another client (present locally
 * but absent from the poll) is correctly dropped. Result is sorted ascending by id.
 *
 * Replaces the previous full-array replace, which wiped paginated history on every poll
 * tick and yanked the scroll back to the bottom.
 */
export function reconcileNewestWindow<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const windowFloor = Math.min(...incoming.map(item => item.id));
  const older = current.filter(item => item.id < windowFloor);
  const merged = new Map<number, T>();
  [...older, ...incoming].forEach(item => merged.set(item.id, item));
  return Array.from(merged.values()).sort((left, right) => left.id - right.id);
}
