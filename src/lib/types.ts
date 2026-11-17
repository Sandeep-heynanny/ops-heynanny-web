import type { Timestamp } from "firebase/firestore";

/**
 * Ops workflow for website enquiries. The website saves every lead as "new";
 * the ops team moves it to contacted → converted / not interested.
 */
export type LeadStatus = "new" | "contacted" | "converted" | "not_interested";

export const STATUS_META: Record<LeadStatus, { label: string; tone: string; dot: string }> = {
  new: { label: "New", tone: "bg-blush text-rose-deep", dot: "bg-rose" },
  contacted: { label: "Contacted", tone: "bg-[#fbecc8] text-[#7a5410]", dot: "bg-[#d9a23a]" },
  converted: { label: "Converted", tone: "bg-[#dcefe1] text-success", dot: "bg-success" },
  not_interested: { label: "Not interested", tone: "bg-beige text-muted", dot: "bg-muted/60" },
};

export const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "converted", "not_interested"];

/** Fields only the ops team writes (Firestore rules allow staff to change only status, ops.* and updatedAt). */
export type OpsFields = {
  notes?: string;
  assignedTo?: string;
  updatedBy?: string;
  contactedAt?: Timestamp;
  convertedAt?: Timestamp;
  closedAt?: Timestamp;
  /** When to call a contacted lead back. Shown as a reminder on the dashboard. */
  callbackAt?: Timestamp;
  /** Why a lead didn't go ahead. Required when the status is "not_interested". */
  closeReason?: CloseReason;
};

export type CloseCategory = "unqualified" | "lost" | "dropped";
export type CloseReason = { category: CloseCategory; reason: string };

/** Reasons for not going ahead with a lead, grouped by outcome. Edit the lists here. */
export const CLOSE_REASONS: Record<CloseCategory, { label: string; hint: string; reasons: string[] }> = {
  unqualified: {
    label: "Unqualified",
    hint: "Was never a real customer lead",
    reasons: [
      "Budget does not match",
      "False enquiry",
      "Wrong number",
      "Customer already bought the product/service",
      "Bought product/service with competitor",
      "Did not pick phone",
      "Not interested anymore",
      "Duplicate customer",
      "Looking for job",
    ],
  },
  lost: {
    label: "Closed lost",
    hint: "A real customer we didn't win",
    reasons: [
      "No followup",
      "Not interested",
      "Booked with competitor",
      "Not answering/responding",
      "Bought product/service with competitor",
      "Low budget",
      "Postponed the decision of buying product/service",
      "Japa part time",
    ],
  },
  dropped: {
    label: "Dropped",
    hint: "We can't serve this request",
    reasons: ["Unserviceable area", "Service less than 7 hours"],
  },
};

export const CLOSE_CATEGORIES = Object.keys(CLOSE_REASONS) as CloseCategory[];

/** "Closed lost · Low budget" */
export function closeReasonLabel(r: CloseReason | null | undefined) {
  if (!r) return "";
  return `${CLOSE_REASONS[r.category]?.label ?? r.category} · ${r.reason}`;
}

/**
 * A `leads/{id}` document as the website writes it (src/lib/firebase/leads.ts there),
 * from the "Request a call back" form on /nanny-services-bangalore and the floating WhatsApp form.
 */
export type Lead = {
  id: string;
  userId: string;
  channel: string;
  status: LeadStatus;
  /** Missing on enquiries sent before the name field was added. */
  name?: string | null;
  careType: string;
  /** "Immediately", "Within 2 weeks"… or "Not specified" (the call-back form doesn't ask). */
  when: string;
  area: string;
  /** 10 digits, no country code. */
  phone: string;
  email?: string | null;
  leadSource?: string | null;
  page?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  ops?: OpsFields;
  /** Only on leads from Meta (Facebook / Instagram) lead forms, written by the `leads` Cloud Functions. */
  meta?: MetaInfo;
};

/** Ad and form details saved with a Meta lead (hey-nanny/functions-leads/src/meta/model.ts). */
export type MetaInfo = {
  leadId: string;
  formName?: string | null;
  adName?: string | null;
  adsetName?: string | null;
  campaignName?: string | null;
  /** "fb", "ig", "msg", "wa"… */
  platform?: string | null;
  isOrganic?: boolean;
  /** Every question and answer on the form, as submitted. */
  answers?: { question: string; answer: string }[];
  /** Phone as typed, when it wasn't a 10-digit Indian mobile. */
  rawPhone?: string | null;
};

export const META_CHANNEL = "meta_lead_ad";

const PLATFORM_NAMES: Record<string, string> = { fb: "Facebook", ig: "Instagram", msg: "Messenger", wa: "WhatsApp" };

export function metaPlatform(platform: string | null | undefined) {
  return (platform && PLATFORM_NAMES[platform]) || "Meta";
}

/** "what_type_of_care_do_you_need?" → "What type of care do you need?" */
export function questionLabel(q: string) {
  const s = q.replace(/_+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short reference for calls and notes. */
export function leadRef(l: Pick<Lead, "id">) {
  if (l.id.startsWith("meta_")) return `META-${l.id.slice(-6)}`;
  return `ENQ-${l.id.slice(0, 6).toUpperCase()}`;
}

/** Which form the enquiry came from: a website page or a Meta lead form. */
export function formName(l: Pick<Lead, "page" | "channel" | "meta">) {
  if (l.channel === META_CHANNEL) return `Meta form${l.meta?.formName ? `: ${l.meta.formName}` : ""}`;
  const page = l.page;
  if (!page) return "Website";
  if (page.startsWith("/nanny-services-bangalore")) return "Google Ads page";
  if (page === "/") return "Home page";
  return page;
}

/** "Japa Care (newborn) - 24 hrs live-in" → "Japa Care (newborn)" for tight spaces. */
export function careShort(careType: string) {
  return careType.split(" - ")[0]!.trim();
}

/** Phone as saved by the website (10 digits) → "+91 98765 43210". */
export function displayPhone(phone: string) {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

/** Where a lead came from, for the badge and the "Source" filter. */
export type LeadOrigin = "google_ads" | "meta" | "website";

export const ORIGIN_META: Record<LeadOrigin, { label: string; tone: string }> = {
  google_ads: { label: "Google Ads", tone: "bg-[#e3edfd] text-[#1a56c4] ring-[#bcd2f7]" },
  meta: { label: "Meta", tone: "bg-[#ece6fb] text-[#5b3cc4] ring-[#d3c6f5]" },
  website: { label: "Website", tone: "bg-beige text-muted ring-line" },
};

export const ORIGINS = Object.keys(ORIGIN_META) as LeadOrigin[];

/**
 * Meta lead forms, or anything tagged meta_*; Google Ads = the Ads landing page
 * (/nanny-services-bangalore) or a google_ads / gclid-style lead source; else the website.
 */
export function leadOrigin(l: Pick<Lead, "channel" | "leadSource" | "page">): LeadOrigin {
  const src = (l.leadSource ?? "").toLowerCase();
  if (l.channel === META_CHANNEL || src.startsWith("meta")) return "meta";
  if (l.page?.startsWith("/nanny-services-bangalore") || /google|gads|adwords|gclid/.test(src)) return "google_ads";
  return "website";
}
