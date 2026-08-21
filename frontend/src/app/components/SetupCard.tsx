import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderUp, ShieldCheck, SlidersHorizontal, Trophy } from "lucide-react";

import {
  companyQualificationIsSet, getCompanyCredentials, getCompanyQualification,
  getDocumentsPage, getTenderProfile, tenderProfileIsSet,
} from "../api";
import type { Page } from "../lib/types";

/**
 * "Kurulum" — the four things a new company has to do before any of this works for them.
 *
 * <p>The same checklist the phone shows, on the surface where most of the four are actually done.
 * Yeterlik figures come off a balance sheet, company paperwork is scanned at a desk, and the
 * archive is uploaded from a computer; a boss setting the product up sits here, not on a phone.
 *
 * <p>On the first morning the product is technically complete and practically empty: the bulletin
 * shows all four hundred of today's announcements because nothing has been narrowed, the yeterlik
 * checklist answers "bilinmiyor" on every line because it has no figures to compare against, and
 * the expiry warnings warn about nothing. Everything looks like it is working, which is worse than
 * looking broken — there is nothing to fix.
 *
 * <p>State is read from the server every time rather than stored in a flag: a company that deletes
 * its documents is back to an empty archive whatever a "seen the tour" bit says.
 */

type Step = {
  key: string;
  /** null while unknown — a probe that failed must not be reported as either done or pending. */
  done: boolean | null;
  label: string;
  hint: string;
  icon: typeof SlidersHorizontal;
  page: Page;
};

export function SetupCard({ setPage }: { setPage: (page: Page) => void }) {
  const [profileSet, setProfileSet] = useState<boolean | null>(null);
  const [qualificationSet, setQualificationSet] = useState<boolean | null>(null);
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [hasDocuments, setHasDocuments] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const set = (apply: (value: boolean | null) => void) => ({
      ok: (value: boolean) => { if (!cancelled) apply(value); },
      fail: () => { if (!cancelled) apply(null); },
    });

    // Separate probes so one endpoint being down costs its own line and nothing else.
    const profile = set(setProfileSet);
    void getTenderProfile()
      .then(value => profile.ok(tenderProfileIsSet(value)))
      .catch(profile.fail);

    const qualification = set(setQualificationSet);
    void getCompanyQualification()
      .then(value => qualification.ok(companyQualificationIsSet(value)))
      .catch(qualification.fail);

    const credentials = set(setHasCredentials);
    void getCompanyCredentials()
      .then(list => credentials.ok(list.length > 0))
      .catch(credentials.fail);

    const documents = set(setHasDocuments);
    // One row is all it takes to answer "is there anything in here"; the total comes with it.
    void getDocumentsPage(0, 1)
      .then(page => documents.ok(page.page.total > 0))
      .catch(documents.fail);

    return () => { cancelled = true; };
  }, []);

  const steps: Step[] = [
    {
      key: "profile",
      done: profileSet,
      label: "İhale profilinizi belirleyin",
      hint: "Hangi işler, hangi iller — bülten ve sabah bildirimi buna göre süzülür",
      icon: SlidersHorizontal,
      page: "tender-bulletin",
    },
    {
      // Second, because once the right tenders are on screen the next question every one of them
      // raises is whether the company can bid at all.
      key: "qualification",
      done: qualificationSet,
      label: "Yeterlik bilgilerinizi girin",
      hint: "Ciro, iş deneyimi, banka referansı — her ihalede girebilir misiniz, söyleyelim",
      icon: Trophy,
      page: "company-qualification",
    },
    {
      key: "credentials",
      done: hasCredentials,
      label: "Şirket belgelerinizi ekleyin",
      hint: "İmza sirküleri, oda kaydı, borcu yoktur — süresi dolmadan haber verelim",
      icon: ShieldCheck,
      page: "company-credentials",
    },
    {
      key: "documents",
      done: hasDocuments,
      label: "Şartname ve sözleşmelerinizi yükleyin",
      hint: "Yüklediğiniz belgelerin içinde arama yapabilirsiniz",
      icon: FolderUp,
      page: "upload",
    },
  ];

  // Nothing known to be missing — either the company is set up or we could not read its state, and
  // in both cases a checklist would be noise on a screen that has real numbers on it.
  if (!steps.some(step => step.done === false)) return null;

  const known = steps.filter(step => step.done !== null);
  const finished = known.filter(step => step.done).length;

  return (
    <section className="rounded border border-border bg-white">
      <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
        <h2 className="text-sm font-bold text-foreground">Kurulum</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {finished} / {known.length}
        </span>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {steps.map(step => {
          const Icon = step.icon;
          // An unreadable step is left out rather than shown as pending: telling a company to add
          // paperwork it already added is the one way this card can lose its credibility.
          if (step.done === null) return null;
          return (
            <button
              key={step.key}
              onClick={() => setPage(step.page)}
              className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors group"
            >
              <span
                className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
                  step.done ? "bg-teal-50" : "border border-dashed border-slate-300"
                }`}
              >
                {step.done
                  ? <Check className="w-4 h-4 text-teal-600" />
                  : <Icon className="w-4 h-4 text-slate-400" />}
              </span>
              <span className="flex-1 min-w-0">
                {/* Done steps stay on the list, struck through and dimmed. Removing them would
                    leave a shorter list with no evidence of progress, and progress is the only
                    reason anybody finishes a checklist. */}
                <span className={`block text-sm ${
                  step.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}>
                  {step.label}
                </span>
                {!step.done && (
                  <span className="block text-xs text-muted-foreground">{step.hint}</span>
                )}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 shrink-0 transition-colors" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
