import type { NannyInput, NannyStatus, WorkType } from "@/lib/nannies";

/**
 * Turns a spreadsheet (CSV rows) into nanny profiles: guesses which column is
 * which, tidies values (phones, languages, "4 yrs", "Fresher", city names) and
 * drops duplicates by phone. Pure, so it can be checked without Firestore.
 */
export type Target =
  | "name"
  | "phone"
  | "altPhone"
  | "role"
  | "age"
  | "experienceYears"
  | "languages"
  | "workType"
  | "area"
  | "city"
  | "skills"
  | "status"
  | "photoUrl"
  | "notes";

export const TARGETS: { key: Target; label: string; guess: RegExp }[] = [
  {
    key: "name",
    label: "Name *",
    guess: /^(full\s*)?name$|^nanny|^caregiver/i,
  },
  {
    key: "phone",
    label: "Phone",
    guess: /^(phone|mobile|number|contact|whatsapp)(\s*(no|number|1))?\.?$/i,
  },
  {
    key: "altPhone",
    label: "Alternate phone",
    guess: /alt|alternate|second|other\s*(phone|number)|phone\s*2|number\s*2/i,
  },
  {
    key: "role",
    label: "Role / category",
    guess: /role|category|type of (care|nanny)|designation|service/i,
  },
  { key: "age", label: "Age", guess: /^age\b/i },
  { key: "experienceYears", label: "Experience (years)", guess: /exp/i },
  { key: "languages", label: "Languages", guess: /lang/i },
  {
    key: "workType",
    label: "Work type (live-in / day)",
    guess: /live|shift|hours|work\s*type|timing/i,
  },
  {
    key: "area",
    label: "Area / locality",
    guess: /locality|area|location|address/i,
  },
  { key: "city", label: "City", guess: /^city$|^town$/i },
  { key: "skills", label: "Skills", guess: /skill/i },
  { key: "status", label: "Status", guess: /status|availab/i },
  { key: "photoUrl", label: "Photo link", guess: /photo|image|picture/i },
  { key: "notes", label: "Notes", guess: /note|remark|comment/i },
];

export type ColumnMap = Partial<Record<Target, number>>;

/** Best guess for each field, each column used once (in the order of TARGETS). */
export function guessColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const t of TARGETS) {
    const i = header.findIndex(
      (col, idx) => !used.has(idx) && t.guess.test(col.trim()),
    );
    if (i >= 0) {
      map[t.key] = i;
      used.add(i);
    }
  }
  return map;
}

const LANGUAGE_FIXES: Record<string, string> = {
  kaanada: "Kannada",
  kanada: "Kannada",
  assames: "Assamese",
  gujrati: "Gujarati",
  bbengali: "Bengali",
  odiya: "Odia",
  oriya: "Odia",
  malyalam: "Malayalam",
  telgu: "Telugu",
  hindhi: "Hindi",
  englsih: "English",
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** "kannada, tamil,Telugu" / "Hindi  Basic, English Basic" → ["Kannada", "Tamil", "Telugu"] / ["Hindi (basic)", "English (basic)"]. */
export function cleanLanguages(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;/|]|\band\b/i)) {
    let s = part.trim().replace(/\s+/g, " ");
    if (!s) continue;
    const basic = /\bbasic\b/i.test(s);
    s = s.replace(/\bbasic\b/gi, "").trim();
    if (!s) continue;
    const fixed = LANGUAGE_FIXES[s.toLowerCase()] ?? titleCase(s);
    const value = basic ? `${fixed} (basic)` : fixed;
    if (!out.some((x) => x.toLowerCase() === value.toLowerCase()))
      out.push(value);
  }
  return out;
}

/** "4 yrs" → 4, "10 years" → 10, "3 yra" → 3, "Fresher" → 0. */
export function cleanYears(raw: string): number | null {
  if (/fresher|new|none/i.test(raw)) return 0;
  const m = raw.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Ten-digit Indian mobile, or null. */
export function cleanPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

const CITY_FIXES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  "new delhi": "Delhi",
};

export function cleanPlace(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return (
    CITY_FIXES[s.toLowerCase()] ??
    (s === s.toLowerCase() || s === s.toUpperCase() ? titleCase(s) : s)
  );
}

/** From an explicit work-type column, or from the category ("Live-In Nanny", "Japa Nanny" = live-in, "Day Nanny" = day). */
export function workTypeFrom(workType: string, role: string): WorkType | null {
  const s = `${workType} ${workType ? "" : role}`.toLowerCase();
  const live = /live|japa|24/.test(s);
  const day = /\bday\b|hour|shift|part/.test(s);
  if (live && day) return "both";
  if (live) return "live_in";
  if (day) return "day";
  return null;
}

export function statusFrom(raw: string): NannyStatus {
  const s = raw.toLowerCase();
  if (/place|deploy|working/.test(s)) return "placed";
  if (/leave/.test(s)) return "on_leave";
  if (/inactive|left|blacklist|not avail/.test(s)) return "inactive";
  if (/interview/.test(s)) return "interviewing";
  return "available";
}

export type ImportPlan = {
  rows: NannyInput[];
  skippedNoName: number;
  /** Same phone twice in the file: only the first is kept. */
  duplicatesInFile: { name: string; phone: string; keptAs: string }[];
  /** Phone already in the nanny database: not imported again. */
  alreadyInDatabase: { name: string; phone: string }[];
  /** Rows imported without a valid phone. */
  noPhone: string[];
};

export function planImport(
  body: string[][],
  map: ColumnMap,
  existingPhones: Set<string>,
): ImportPlan {
  const plan: ImportPlan = {
    rows: [],
    skippedNoName: 0,
    duplicatesInFile: [],
    alreadyInDatabase: [],
    noPhone: [],
  };
  const get = (r: string[], t: Target) =>
    map[t] !== undefined ? (r[map[t]!] ?? "").trim() : "";
  const seen = new Map<string, string>();
  for (const r of body) {
    const name = get(r, "name").replace(/\s+/g, " ");
    if (!name) {
      plan.skippedNoName++;
      continue;
    }
    const prettyName = name === name.toLowerCase() ? titleCase(name) : name;
    const phone = cleanPhone(get(r, "phone"));
    if (phone) {
      if (existingPhones.has(phone)) {
        plan.alreadyInDatabase.push({ name: prettyName, phone });
        continue;
      }
      if (seen.has(phone)) {
        plan.duplicatesInFile.push({
          name: prettyName,
          phone,
          keptAs: seen.get(phone)!,
        });
        continue;
      }
      seen.set(phone, prettyName);
    } else plan.noPhone.push(prettyName);
    const role = get(r, "role");
    const alt = cleanPhone(get(r, "altPhone"));
    plan.rows.push({
      name: prettyName,
      phone,
      altPhone: alt && alt !== phone ? alt : null,
      photoUrl: /^https?:\/\//.test(get(r, "photoUrl"))
        ? get(r, "photoUrl")
        : null,
      age: cleanYears(get(r, "age")) || null,
      role: role ? cleanPlace(role) : null,
      experienceYears: get(r, "experienceYears")
        ? cleanYears(get(r, "experienceYears"))
        : null,
      languages: cleanLanguages(get(r, "languages")),
      workType: workTypeFrom(get(r, "workType"), role),
      area: cleanPlace(get(r, "area")),
      city: cleanPlace(get(r, "city")),
      skills: [
        ...new Set(
          get(r, "skills")
            .split(/[,;/]/)
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ],
      status:
        map.status !== undefined ? statusFrom(get(r, "status")) : "available",
      placement: null,
      notes: get(r, "notes"),
    });
  }
  return plan;
}
