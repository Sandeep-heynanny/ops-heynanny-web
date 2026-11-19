"use client";

import { Check, MapPin, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { NannyAvatar } from "@/components/NannyAvatar";
import { suggestNannies } from "@/lib/matching";
import { NANNY_STATUS_META, type Nanny } from "@/lib/nannies";
import type { Intake } from "@/lib/servicing";

/** How many suggestions to show (Sandeep, 2026-11-19: 5 for now). */
const SHOW = 5;
/** Day Nanny: how far from the customer's map pin. */
const DAY_MAX_KM = 5;

/**
 * Step 1 on a case: the best-matching nannies from the Servicing form, with
 * the reasons, to tick and share (same as picking them in the list below).
 * Rules in src/lib/matching.ts.
 */
export function SuggestedNannies({
  intake,
  careType,
  nannies,
  exclude,
  disabled,
  onAdd,
}: {
  intake: Intake;
  careType: string | null;
  nannies: Nanny[];
  exclude: Set<string>;
  disabled: boolean;
  onAdd: (picked: Nanny[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const result = useMemo(
    () => suggestNannies(intake, careType, nannies, exclude, DAY_MAX_KM),
    [intake, careType, nannies, exclude],
  );
  const top = result.list.slice(0, SHOW);
  const wantedAges = (intake.nannyAge ?? []).join(", ");

  const rule = result.japaOnly
    ? "Japa Nannies only · language, then age"
    : result.mode === "day"
      ? `Within ${DAY_MAX_KM} km · language, then age, then nearest`
      : "Language, then age · location not needed (she stays with the family)";

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="mb-3 rounded-xl border border-[#ddd3fa] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-1 items-center gap-1.5 text-sm font-bold text-plum">
          <Sparkles className="size-4 text-[#5b3cc4]" aria-hidden="true" />
          Suggested nannies
          <span className="font-normal text-muted">
            · {result.list.length > SHOW ? `top ${SHOW} of ${result.list.length}` : `${result.list.length} found`}
          </span>
        </p>
        <button
          type="button"
          disabled={!picked.length || disabled}
          onClick={() => {
            const chosen = picked.map((id) => nannies.find((n) => n.id === id)).filter((n): n is Nanny => !!n);
            onAdd(chosen);
            setPicked([]);
          }}
          className="h-9 rounded-full bg-plum px-4 text-sm font-semibold text-milk disabled:opacity-40"
        >
          Share {picked.length || ""}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted">{rule}</p>

      {result.needsCustomerPin ? (
        <p className="mt-3 rounded-lg bg-[#fff6e5] px-3 py-2 text-xs text-[#7a5410]">
          Pick the customer’s location on the map in Requirements to see nannies nearby.
        </p>
      ) : !top.length ? (
        <p className="mt-3 text-sm text-muted">
          No available nannies match yet. Use the list below to pick from everyone.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {top.map((s) => {
            const n = s.nanny;
            const on = picked.includes(n.id);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(n.id)}
                  aria-pressed={on}
                  className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-milk/50 disabled:opacity-50"
                >
                  <span
                    className={`mt-1 grid size-5 shrink-0 place-items-center rounded border ${on ? "border-plum bg-plum text-milk" : "border-line bg-white"}`}
                  >
                    {on && <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                  <NannyAvatar name={n.name} photoUrl={n.photoUrl} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-plum">
                      {n.name}
                      <span className="text-xs font-normal text-muted">
                        {[n.role, n.experienceYears !== null ? `${n.experienceYears} yrs exp` : null].filter(Boolean).join(" · ")}
                      </span>
                      {n.status !== "available" && (
                        <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${NANNY_STATUS_META[n.status].tone}`}>
                          {NANNY_STATUS_META[n.status].label}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5 text-[0.72rem] font-semibold">
                      {s.km !== null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#e3edfd] px-2 py-0.5 text-[#1a56c4]">
                          <MapPin className="size-3" aria-hidden="true" />
                          {s.km < 1 ? `${Math.round(s.km * 1000)} m` : `${s.km.toFixed(1)} km`}
                        </span>
                      )}
                      {s.languages.length ? (
                        <span className="rounded-full bg-[#dcefe1] px-2 py-0.5 text-success">✓ {s.languages.join(", ")}</span>
                      ) : s.languageMiss ? (
                        <span className="rounded-full bg-beige px-2 py-0.5 text-muted">
                          No {(intake.languages ?? []).filter((l) => l !== "Other").join(" / ")}
                        </span>
                      ) : null}
                      {s.ageFits === true ? (
                        <span className="rounded-full bg-[#dcefe1] px-2 py-0.5 text-success">✓ {n.age} yrs</span>
                      ) : s.ageFits === false ? (
                        <span className="rounded-full bg-beige px-2 py-0.5 text-muted">
                          {n.age} yrs · wants {wantedAges}
                        </span>
                      ) : n.age === null && wantedAges ? (
                        <span className="rounded-full bg-beige px-2 py-0.5 text-muted">Age not set</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {result.mode === "day" && !result.needsCustomerPin && result.withoutPin > 0 && (
        <p className="mt-2 rounded-lg bg-[#fff6e5] px-3 py-2 text-xs text-[#7a5410]">
          {result.withoutPin} {result.withoutPin === 1 ? "nanny has" : "nannies have"} no map location yet, so{" "}
          {result.withoutPin === 1 ? "she can’t" : "they can’t"} be suggested. Add it on the Nannies page.
        </p>
      )}
    </div>
  );
}
