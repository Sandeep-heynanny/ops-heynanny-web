import { TEAM_LEAD_SOURCES } from "@/lib/types";

/** Same choices as the website's enquiry form (hey-nanny WhatsAppLead.tsx). */
export const NEW_LEAD_CARE_TYPES = [
  "Japa Care (newborn) - 24 hrs live-in",
  "Live-In Nanny - baby 2 months+",
  "Day Nanny - baby 3 months+",
  "Flexi Care (one day)",
] as const;
export const NEW_LEAD_WHEN = [
  "Not specified",
  "Immediately",
  "Within 2 weeks",
  "Within a month",
  "Just exploring",
] as const;

export type NewLeadInput = {
  name: string;
  phone: string;
  careType: string;
  when: string;
  area: string;
  email: string;
  source: string;
  referredBy: string;
  note: string;
};

export const emptyNewLead = (): NewLeadInput => ({
  name: "",
  phone: "",
  careType: "",
  when: "Not specified",
  area: "",
  email: "",
  source: "Referral",
  referredBy: "",
  note: "",
});

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** "+91 98765-43210" → "9876543210" */
export const tenDigits = (p: string) =>
  p.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");

export function newLeadFromUnknown(v: unknown): NewLeadInput {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    name: str(o.name, 80),
    phone: tenDigits(str(o.phone, 20)),
    careType: str(o.careType, 60),
    when: str(o.when, 60) || "Not specified",
    area: str(o.area, 120),
    email: str(o.email, 120).toLowerCase(),
    source: str(o.source, 40) || "Referral",
    referredBy: str(o.referredBy, 80),
    note: typeof o.note === "string" ? o.note.trim().slice(0, 1000) : "",
  };
}

/** Field → message; empty when the enquiry can be saved. Used by the browser and the server. */
export function checkNewLead(
  f: NewLeadInput,
): Partial<Record<keyof NewLeadInput, string>> {
  const e: Partial<Record<keyof NewLeadInput, string>> = {};
  if (f.name.trim().length < 2) e.name = "Enter the customer's name.";
  if (!/^[6-9]\d{9}$/.test(tenDigits(f.phone)))
    e.phone = "Enter a 10-digit Indian mobile number.";
  if (!(NEW_LEAD_CARE_TYPES as readonly string[]).includes(f.careType))
    e.careType = "Pick the type of care.";
  if (!(NEW_LEAD_WHEN as readonly string[]).includes(f.when))
    e.when = "Pick when it's needed.";
  if (f.area.trim().length < 2) e.area = "Enter the area.";
  if (f.email.trim() && !/^[^ @]+@[^ @]+\.[^ @]+$/.test(f.email.trim()))
    e.email = "Enter a valid email, or leave it empty.";
  if (!(TEAM_LEAD_SOURCES as readonly string[]).includes(f.source))
    e.source = "Pick the source.";
  return e;
}
