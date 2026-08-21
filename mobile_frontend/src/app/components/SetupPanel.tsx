import { useEffect, useState } from "react";
import {
  Check, ChevronRight, FolderUp, ShieldCheck, SlidersHorizontal, Trophy,
} from "lucide-react";

import {
  companyQualificationIsSet, getCompanyCredentials, getCompanyQualification,
  getTenderDocumentsPage, getTenderProfile, tenderProfileIsSet,
} from "../api";

/**
 * "Kurulum" — the four things a new company has to do before any of this works for them.
 *
 * <p>On the first morning the product is technically complete and practically empty: the bulletin
 * shows all four hundred of today's announcements because nothing has been narrowed, the expiry
 * warnings warn about nothing, the yeterlik checklist answers "bilinmiyor" on every line because
 * it has no figures to compare against, and "Belgelere Sor" has no documents to answer from.
 * Everything looks like it is working, which is worse than looking broken — there is nothing to
 * fix.
 *
 * <p>So the home screen names the three steps and gets out of the way. State is read from the
 * server every time rather than stored in a flag: a company that deletes its documents is back to
 * an empty archive whatever a "seen the tour" bit says, and the panel has to be able to say so.
 *
 * <p>Admin-only, because all four are admin actions. An employee cannot set the tender profile or
 * add company paperwork, and a checklist you have no way to complete is just a reproach.
 */

type Step = {
  key: string;
  /** null while unknown — a probe that failed must not be reported as either done or pending. */
  done: boolean | null;
  label: string;
  hint: string;
  icon: typeof SlidersHorizontal;
  onPress: () => void;
};

export function SetupPanel({
  onOpenProfile, onOpenQualification, onOpenCredentials, onOpenArchive,
}: {
  onOpenProfile: () => void;
  onOpenQualification: () => void;
  onOpenCredentials: () => void;
  onOpenArchive: () => void;
}) {
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

    // Separate probes so one endpoint being down costs its own line and nothing else. Two of them
    // repeat what TodayPanel asks for; that is a pair of cheap GETs against a single-row profile
    // and a short list, and worth more than the coupling that sharing them would cost.
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
    void getTenderDocumentsPage(0, 1)
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
      onPress: onOpenProfile,
    },
    {
      // Second, because once the right tenders are on screen the next question every one of them
      // raises is whether the company can bid at all — and until these figures exist the yeterlik
      // checklist can only answer "bilinmiyor", which reads as a broken feature rather than a
      // missing input. Buried until now behind a tender's own qualification section, which meant
      // finding a tender before you could say anything about yourself.
      key: "qualification",
      done: qualificationSet,
      label: "Yeterlik bilgilerinizi girin",
      hint: "Ciro, iş deneyimi, banka referansı — her ihalede girebilir misiniz, söyleyelim",
      icon: Trophy,
      onPress: onOpenQualification,
    },
    {
      key: "credentials",
      done: hasCredentials,
      label: "Şirket belgelerinizi ekleyin",
      hint: "İmza sirküleri, oda kaydı, borcu yoktur — süresi dolmadan haber verelim",
      icon: ShieldCheck,
      onPress: onOpenCredentials,
    },
    {
      key: "documents",
      done: hasDocuments,
      label: "Şartname ve sözleşmelerinizi yükleyin",
      hint: "Yüklediğiniz belgelerin içinde arama yapabilirsiniz",
      icon: FolderUp,
      onPress: onOpenArchive,
    },
  ];

  // Nothing known to be missing — either the company is set up or we could not read its state, and
  // in both cases a checklist would be noise on a screen that has real numbers on it.
  if (!steps.some(step => step.done === false)) return null;

  const known = steps.filter(step => step.done !== null);
  const finished = known.filter(step => step.done).length;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Kurulum</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {finished} / {known.length}
        </span>
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {steps.map(step => {
          const Icon = step.icon;
          // An unreadable step is left out rather than shown as pending: telling a company to add
          // paperwork it already added is the one way this panel can lose its credibility.
          if (step.done === null) return null;
          return (
            <button
              key={step.key}
              onClick={step.onPress}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-white/[0.03] transition-colors"
            >
              <span
                className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
                  step.done ? "bg-primary/15" : "border border-dashed border-white/20"
                }`}
              >
                {step.done
                  ? <Check className="w-4 h-4 text-primary" />
                  : <Icon className="w-4 h-4 text-muted-foreground" />}
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
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
