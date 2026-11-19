/**
 * Suggested nannies for a servicing case, from its Servicing form (Sandeep, 2026-11-19):
 * - Japa / Live-In: the nanny stays at the customer's home, so location doesn't
 *   matter. Rank by language, then age. Japa cases suggest only Japa nannies
 *   (role contains "Japa").
 * - Day Nanny: only nannies within `maxKm` of the customer's map pin, then
 *   language, then age (then the nearest).
 * Only available / interviewing nannies whose work type fits. Pure functions.
 */
import { distanceKm, validGeo } from "@/lib/geo";
import type { Nanny } from "@/lib/nannies";
import type { Intake } from "@/lib/servicing";

export type MatchMode = "day" | "stay";

/** "Day Nanny" → day; "Live-In Nanny" / "Japa Nanny" → stay. */
export function matchMode(careType: string | null | undefined): MatchMode | null {
  const t = (careType ?? "").toLowerCase();
  if (t.includes("japa") || t.includes("live")) return "stay";
  if (t.includes("day")) return "day";
  return null;
}

/** "30-40" → [30, 40]; "50+" → [50, 120]. */
function ageRange(r: string): [number, number] | null {
  const plus = /^(\d+)\s*\+$/.exec(r.trim());
  if (plus) return [Number(plus[1]), 120];
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(r.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export type Suggestion = {
  nanny: Nanny;
  /** Languages she shares with what the customer asked for. */
  languages: string[];
  /** Customer asked for languages and she speaks none of them. */
  languageMiss: boolean;
  /** true / false against the asked age ranges; null when unknown or not asked. */
  ageFits: boolean | null;
  /** Straight-line km from the customer (Day Nanny with both pins), else null. */
  km: number | null;
};

export type SuggestResult = {
  mode: MatchMode | null;
  list: Suggestion[];
  /** Day Nanny: the customer's location wasn't picked on the map, so no distance filter. */
  needsCustomerPin: boolean;
  /** Day Nanny: nannies that would fit but have no map location yet. */
  withoutPin: number;
  /** Japa case: only Japa-role nannies were considered. */
  japaOnly: boolean;
};

const lc = (s: string) => s.trim().toLowerCase();

export function suggestNannies(
  intake: Pick<Intake, "careType" | "languages" | "nannyAge" | "locationGeo"> | null,
  careType: string | null,
  nannies: Nanny[],
  exclude: Set<string>,
  maxKm = 5,
): SuggestResult {
  const type = intake?.careType || careType;
  const mode = matchMode(type);
  const japaOnly = /japa/i.test(type ?? "");
  const wanted = (intake?.languages ?? []).filter((l) => l && lc(l) !== "other");
  const ranges = (intake?.nannyAge ?? []).map(ageRange).filter((r): r is [number, number] => !!r);
  const home = validGeo(intake?.locationGeo) ? intake!.locationGeo! : null;

  const fitsWork = (n: Nanny) =>
    !mode || !n.workType || n.workType === "both" || (mode === "day" ? n.workType === "day" : n.workType === "live_in");

  let withoutPin = 0;
  const list: Suggestion[] = [];
  for (const n of nannies) {
    if (exclude.has(n.id)) continue;
    if (n.status !== "available" && n.status !== "interviewing") continue;
    if (!fitsWork(n)) continue;
    if (japaOnly && !/japa/i.test(n.role ?? "")) continue;

    let km: number | null = null;
    if (mode === "day" && home) {
      if (!validGeo(n.geo)) {
        withoutPin += 1;
        continue;
      }
      km = distanceKm(home, n.geo);
      if (km > maxKm) continue;
    }

    const theirs = new Set(n.languages.map(lc));
    const languages = wanted.filter((l) => theirs.has(lc(l)));
    const ageFits = ranges.length && n.age ? ranges.some(([lo, hi]) => n.age! >= lo && n.age! <= hi) : null;
    list.push({ nanny: n, languages, languageMiss: wanted.length > 0 && !languages.length, ageFits, km });
  }

  list.sort(
    (a, b) =>
      // 1. language (more shared languages first), 2. age, 3. nearest (Day), 4. available, 5. experience
      b.languages.length - a.languages.length ||
      Number(b.ageFits === true) - Number(a.ageFits === true) ||
      (a.km ?? 0) - (b.km ?? 0) ||
      Number(b.nanny.status === "available") - Number(a.nanny.status === "available") ||
      (b.nanny.experienceYears ?? 0) - (a.nanny.experienceYears ?? 0) ||
      a.nanny.name.localeCompare(b.nanny.name),
  );

  const needsCustomerPin = mode === "day" && !home;
  // Day Nanny without the customer's pin: no distance to filter by, so no list.
  return { mode, list: needsCustomerPin ? [] : list, needsCustomerPin, withoutPin, japaOnly };
}
