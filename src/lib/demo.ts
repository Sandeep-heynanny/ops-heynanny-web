import { Timestamp } from "firebase/firestore";

import type { Staff } from "@/lib/auth";
import type { Lead, LeadStatus } from "@/lib/types";

/**
 * Sample data for previewing the UI without signing in.
 * Only used when NEXT_PUBLIC_OPS_DEMO=1 (never set on the live dashboard).
 */
export const DEMO_STAFF: Staff = { uid: "demo", email: "priya@heynanny.in", name: "Priya Sharma", photo: null, role: "ops" };

const JAPA = "Japa Care (newborn) - 24 hrs live-in";
const LIVE = "Live-In Nanny - baby 2 months+";
const DAY = "Day Nanny - baby 3 months+";
const FLEXI = "Flexi Care (one day)";

const NAMES = ["Ananya Rao", "Rahul Menon", "Sneha Kulkarni", "Vikram Iyer", "Meera Nair", "Karthik Reddy", "Divya Shetty", null];

const rows: [string, string | null, string, string, string, number, string, LeadStatus, string | null, string?][] = [
  // phone, email, care, when, area, minutesAgo, page, status, lead, assigned
  ["9845012345", "ananya.rao@example.com", DAY, "Not specified", "HSR Layout", 4, "/nanny-services-bangalore", "new", "google_ads"],
  ["9900112233", null, JAPA, "Immediately", "Koramangala", 38, "/", "new", "instagram"],
  ["9731234567", "sneha.k@example.com", LIVE, "Within 2 weeks", "Whitefield", 150, "/nanny-services-bangalore", "new", "google_ads"],
  ["8147001122", null, FLEXI, "Immediately", "Bellandur", 60 * 20, "/", "contacted", null, "priya@heynanny.in"],
  ["9886554433", "meera.nair@example.com", JAPA, "Within a month", "Indiranagar", 60 * 28, "/nanny-services-bangalore", "contacted", "google_ads", "arjun@heynanny.in"],
  ["7019887766", null, LIVE, "Immediately", "Sarjapur Road", 60 * 52, "/", "converted", "referral", "priya@heynanny.in"],
  ["9620443322", "divya.s@example.com", DAY, "Not specified", "JP Nagar", 60 * 75, "/nanny-services-bangalore", "converted", "google_ads", "arjun@heynanny.in"],
  ["9535667788", null, DAY, "Just exploring", "Electronic City", 60 * 100, "/", "not_interested", "instagram", "priya@heynanny.in"],
];

/** One lead from a Meta (Instagram) lead form, as the `leads` Cloud Functions save it. */
function demoMetaLead(now: Date): Lead {
  const created = Timestamp.fromDate(new Date(now.getTime() - 12 * 60_000));
  return {
    id: "meta_1234567890123456",
    userId: "meta",
    channel: "meta_lead_ad",
    status: "new",
    name: "Kavya Hegde",
    careType: "Live-in nanny",
    when: "Within 2 weeks",
    area: "Sobha Daffodil, HSR Layout, Bengaluru",
    phone: "9741122334",
    email: "kavya.h@example.com",
    leadSource: "meta_instagram",
    page: null,
    createdAt: created,
    meta: {
      leadId: "1234567890123456",
      formName: "Nanny enquiry – Nov",
      campaignName: "Bengaluru leads – Nov",
      adsetName: "HSR + Koramangala, parents 25–40",
      adName: "Trained live-in nannies (video)",
      platform: "ig",
      isOrganic: false,
      answers: [
        { question: "full_name", answer: "Kavya Hegde" },
        { question: "phone_number", answer: "+919741122334" },
        { question: "email", answer: "kavya.h@example.com" },
        { question: "what_type_of_care_do_you_need?", answer: "Live-in nanny" },
        { question: "when_do_you_need_a_nanny?", answer: "Within 2 weeks" },
        { question: "your_apartment_/_area", answer: "Sobha Daffodil, HSR Layout" },
      ],
    },
  };
}

export function demoLeads(now = new Date()): Lead[] {
  return [demoMetaLead(now), ...rows.map(([phone, email, careType, when, area, minsAgo, page, status, lead, assigned], i) => {
    const created = Timestamp.fromDate(new Date(now.getTime() - minsAgo * 60_000));
    return {
      id: `d${i}x7k2pq9w${i}`,
      userId: `anon-${i}`,
      channel: "whatsapp_form",
      status,
      name: NAMES[i] ?? null,
      careType,
      when,
      area,
      phone,
      email,
      leadSource: lead,
      page,
      createdAt: created,
      updatedAt: created,
      ops: assigned
        ? {
            assignedTo: assigned,
            updatedBy: assigned,
            notes: status === "not_interested" ? "Only exploring for now. Follow up in 2 months." : undefined,
            closeReason: status === "not_interested" ? { category: "lost" as const, reason: "Postponed the decision of buying product/service" } : undefined,
            // Contacted samples: one call back overdue by 20 min, one tomorrow 10 AM.
            callbackAt:
              status === "contacted"
                ? Timestamp.fromDate(
                    i === 3 ? new Date(now.getTime() - 20 * 60_000) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10),
                  )
                : undefined,
          }
        : undefined,
    };
  })];
}
