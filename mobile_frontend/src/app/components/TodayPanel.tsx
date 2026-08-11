import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Megaphone, ShieldCheck } from "lucide-react";

import {
  getCompanyCredentials, getERPOverview, getTenderProfile,
} from "../api";

/**
 * "Bugün" — what today actually holds for this company, above everything else on the home screen.
 *
 * <p>The screen used to open with six equal cards describing what the application can do. That is a
 * brochure: useful once, on the first morning. Every morning after that the question is not "what
 * does this app have" but "what do I have to deal with" — tenders that suit us, work that is late,
 * paperwork about to lapse. The tools are still there, one scroll down, smaller.
 *
 * <p>Each line is a number and a destination. A zero is left visible and calm rather than hidden:
 * "no late work" is worth reading, and a row that appears and disappears teaches nobody where
 * anything lives.
 */

type Row = {
  key: string;
  count: number | null;
  label: string;
  hint: string;
  icon: typeof Megaphone;
  /**
   * How loudly to say it. Red means something has already gone wrong — a deadline that passed, a
   * document that lapsed. Amber means a clock is running. A zero is neither, on any row: painting
   * good news red is how a colour stops being believed.
   */
  tone: "plain" | "warn" | "bad";
  onPress: () => void;
};

const TONE_TEXT: Record<Row["tone"], string> = {
  plain: "text-foreground",
  warn: "text-amber-400",
  bad: "text-red-400",
};

const TONE_ICON: Record<Row["tone"], string> = {
  plain: "text-muted-foreground",
  warn: "text-amber-400",
  bad: "text-red-400",
};

/** Papers this close to lapsing are worth a line on the home screen. */
const CREDENTIAL_WARN_DAYS = 30;

export function TodayPanel({ isAdmin, userId, onOpenBulletin, onOpenCredentials, onOpenTasks }: {
  isAdmin: boolean;
  /** Null for the admin account, which has no employee row — and no personal task list either. */
  userId: number | null;
  onOpenBulletin: () => void;
  onOpenCredentials: () => void;
  onOpenTasks: () => void;
}) {
  const [matchingTenders, setMatchingTenders] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);
  const [expiring, setExpiring] = useState<number | null>(null);
  /** Kept apart from "expiring": a lapsed document is a different problem from a ticking one. */
  const [lapsed, setLapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const set = <T,>(apply: (value: T) => void) => (value: T) => {
      if (!cancelled) apply(value);
    };

    // Each number is fetched on its own and each failure is its own. One endpoint being down
    // should cost its line, not the whole panel: a blank home screen because the credentials
    // service hiccuped would be a worse bug than the hiccup.
    void getTenderProfile()
      .then(set(profile => setMatchingTenders(profile.matching_count)))
      .catch(() => set(() => setMatchingTenders(null))(null));

    void getERPOverview()
      .then(set(overview => {
        const tasks = overview.tasks || [];
        // An employee is shown their own late work, not the company's. The number is meant to be
        // actionable, and somebody else's overdue task is not something they can act on.
        const mine = isAdmin
          ? tasks
          : tasks.filter(task => new Set(
              (overview.assignments || [])
                .filter(item => item.assignee_user_id === userId)
                .map(item => item.task_id),
            ).has(task.id));
        setOverdue(mine.filter(task => task.status === "overdue").length);
      }))
      .catch(() => set(() => setOverdue(null))(null));

    if (isAdmin) {
      void getCompanyCredentials()
        .then(set(credentials => {
          const dated = credentials.filter(c => c.days_remaining !== null);
          setLapsed(dated.filter(c => (c.days_remaining as number) < 0).length);
          setExpiring(dated.filter(c => (c.days_remaining as number) <= CREDENTIAL_WARN_DAYS).length);
        }))
        .catch(() => set(() => setExpiring(null))(null));
    }

    return () => { cancelled = true; };
  }, [isAdmin, userId]);

  const rows: Row[] = [
    {
      key: "tenders",
      count: matchingTenders,
      label: "Size uygun ihale",
      hint: "bugünkü bültende",
      icon: Megaphone,
      tone: "plain",
      onPress: onOpenBulletin,
    },
    {
      key: "overdue",
      count: overdue,
      label: isAdmin ? "Geciken görev" : "Geciken görevim",
      hint: "teslim tarihi geçti",
      icon: AlertTriangle,
      // A deadline that has passed is not a warning, it is a failure.
      tone: (overdue ?? 0) > 0 ? "bad" : "plain",
      onPress: onOpenTasks,
    },
  ];

  if (isAdmin) {
    rows.push({
      key: "credentials",
      count: expiring,
      label: "Süresi yaklaşan belge",
      hint: lapsed > 0 ? `${lapsed} tanesinin süresi doldu` : `${CREDENTIAL_WARN_DAYS} gün içinde`,
      icon: ShieldCheck,
      // Amber while the clock runs; red only once something has actually lapsed, because a bid
      // cannot be submitted on an expired imza sirküleri and that is a different conversation.
      tone: lapsed > 0 ? "bad" : (expiring ?? 0) > 0 ? "warn" : "plain",
      onPress: onOpenCredentials,
    });
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Bugün</h2>
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {rows.map(row => {
          const Icon = row.icon;
          return (
            <button
              key={row.key}
              onClick={row.onPress}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-white/[0.03] transition-colors"
            >
              <Icon className={`w-4 h-4 shrink-0 ${TONE_ICON[row.tone]}`} />
              {/* Fixed width so the numbers line up in a column; a ragged left edge makes three
                  figures look like three unrelated facts. */}
              <span className={`w-9 text-right text-xl font-semibold tabular-nums ${TONE_TEXT[row.tone]}`}>
                {row.count === null ? "–" : row.count}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-foreground">{row.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.count === null ? "şu an okunamadı" : row.hint}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
