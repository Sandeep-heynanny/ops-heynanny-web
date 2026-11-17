import { Timestamp } from "firebase/firestore";

import type { Staff } from "@/lib/auth";
import type { StaffRole } from "@/lib/firebase";
import type { Nanny } from "@/lib/nannies";
import type {
  LiveRefund,
  Payment,
  PaymentStatus,
  Refund,
  Settlement,
} from "@/lib/payments";
import type { Proposal, ServicingCase } from "@/lib/servicing";
import type { Lead, LeadStatus } from "@/lib/types";

/**
 * Sample data for previewing the UI without signing in.
 * Only used when NEXT_PUBLIC_OPS_DEMO=1 (never set on the live dashboard).
 */
export const DEMO_STAFF: Staff = {
  uid: "demo",
  email: "priya@heynanny.in",
  name: "Priya Sharma",
  photo: null,
  role: "sales",
};

const JAPA = "Japa Care (newborn) - 24 hrs live-in";
const LIVE = "Live-In Nanny - baby 2 months+";
const DAY = "Day Nanny - baby 3 months+";
const FLEXI = "Flexi Care (one day)";

const NAMES = [
  "Ananya Rao",
  "Rahul Menon",
  "Sneha Kulkarni",
  "Vikram Iyer",
  "Meera Nair",
  "Karthik Reddy",
  "Divya Shetty",
  null,
];

const rows: [
  string,
  string | null,
  string,
  string,
  string,
  number,
  string,
  LeadStatus,
  string | null,
  string?,
][] = [
  // phone, email, care, when, area, minutesAgo, page, status, lead, assigned
  [
    "9845012345",
    "ananya.rao@example.com",
    DAY,
    "Not specified",
    "HSR Layout",
    4,
    "/nanny-services-bangalore",
    "new",
    "google_ads",
  ],
  [
    "9900112233",
    null,
    JAPA,
    "Immediately",
    "Koramangala",
    38,
    "/",
    "new",
    "instagram",
  ],
  [
    "9731234567",
    "sneha.k@example.com",
    LIVE,
    "Within 2 weeks",
    "Whitefield",
    150,
    "/nanny-services-bangalore",
    "new",
    "google_ads",
  ],
  [
    "8147001122",
    null,
    FLEXI,
    "Immediately",
    "Bellandur",
    60 * 20,
    "/",
    "contacted",
    null,
    "priya@heynanny.in",
  ],
  [
    "9886554433",
    "meera.nair@example.com",
    JAPA,
    "Within a month",
    "Indiranagar",
    60 * 28,
    "/nanny-services-bangalore",
    "contacted",
    "google_ads",
    "arjun@heynanny.in",
  ],
  [
    "7019887766",
    null,
    LIVE,
    "Immediately",
    "Sarjapur Road",
    60 * 52,
    "/",
    "converted",
    "referral",
    "priya@heynanny.in",
  ],
  [
    "9620443322",
    "divya.s@example.com",
    DAY,
    "Not specified",
    "JP Nagar",
    60 * 75,
    "/nanny-services-bangalore",
    "converted",
    "google_ads",
    "arjun@heynanny.in",
  ],
  [
    "9535667788",
    null,
    DAY,
    "Just exploring",
    "Electronic City",
    60 * 100,
    "/",
    "not_interested",
    "instagram",
    "priya@heynanny.in",
  ],
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
        {
          question: "your_apartment_/_area",
          answer: "Sobha Daffodil, HSR Layout",
        },
      ],
    },
  };
}

export function demoLeads(now = new Date()): Lead[] {
  return [
    demoMetaLead(now),
    ...rows.map(
      (
        [
          phone,
          email,
          careType,
          when,
          area,
          minsAgo,
          page,
          status,
          lead,
          assigned,
        ],
        i,
      ) => {
        const created = Timestamp.fromDate(
          new Date(now.getTime() - minsAgo * 60_000),
        );
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
                notes:
                  status === "not_interested"
                    ? "Only exploring for now. Follow up in 2 months."
                    : undefined,
                closeReason:
                  status === "not_interested"
                    ? {
                        category: "lost" as const,
                        reason:
                          "Postponed the decision of buying product/service",
                      }
                    : undefined,
                // Contacted samples: one call back overdue by 20 min, one tomorrow 10 AM.
                callbackAt:
                  status === "contacted"
                    ? Timestamp.fromDate(
                        i === 3
                          ? new Date(now.getTime() - 20 * 60_000)
                          : new Date(
                              now.getFullYear(),
                              now.getMonth(),
                              now.getDate() + 1,
                              10,
                            ),
                      )
                    : undefined,
              }
            : undefined,
        };
      },
    ),
  ];
}

/** Sample Cashfree payments over the last ~60 days (demo mode only). */
export function demoPayments(now = new Date()): Payment[] {
  const people = [
    ["Ananya Rao", "9845012345"],
    ["Rahul Menon", "9900112233"],
    ["Meera Nair", "9886554433"],
    ["Karthik Reddy", "7019887766"],
    ["Divya Shetty", "9620443322"],
    ["Kavya Hegde", "9741122334"],
  ] as const;
  const amounts = [1999, 4999, 18000, 22000, 999, 26000, 3000];
  const methods = [
    "upi",
    "upi",
    "credit_card",
    "net_banking",
    "upi",
    "debit_card",
  ];
  const out: Payment[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 90; i++) {
    const hoursAgo =
      Math.floor(rnd() * 24 * 60) + (i < 4 ? -Math.floor(rnd() * 20) : 0);
    const at = new Date(now.getTime() - Math.max(1, hoursAgo) * 3600_000);
    const [name, phone] = people[i % people.length]!;
    const r = rnd();
    const status: PaymentStatus =
      r < 0.8 ? "SUCCESS" : r < 0.9 ? "FAILED" : "USER_DROPPED";
    const id = String(5114000000 + i * 137);
    out.push({
      id,
      cf_payment_id: id,
      order_id: i % 3 === 0 ? `link_${id.slice(-6)}` : `HN-${id.slice(-6)}`,
      payment_amount: amounts[i % amounts.length]!,
      payment_currency: "INR",
      payment_status: status,
      payment_time: at.toISOString(),
      payment_method: methods[i % methods.length]!,
      customer_details: {
        customer_id: null,
        customer_name: name,
        customer_email: null,
        customer_phone: phone,
      },
      booking_id: i % 3 === 0 ? null : `bk_${id.slice(-5)}`,
      failure_reason: status === "FAILED" ? "Payment declined by bank" : null,
      environment: "production",
      created_at: Timestamp.fromDate(at),
      servicing_case_id:
        status === "SUCCESS" && i % 4 === 0 ? `case${(i % 5) + 1}` : undefined,
    });
  }
  return out.sort((a, b) => b.payment_time!.localeCompare(a.payment_time!));
}

/** Sample refunds over the last ~45 days (demo mode only). */
export function demoRefunds(now = new Date()): Refund[] {
  const amounts = [8000, 22000, 13500, 4999, 18000, 9867.64, 3000, 15500];
  return amounts.map((amount, i) => {
    const at = new Date(now.getTime() - (i * 26 + 5) * 3600_000);
    const id = String(11325600 + i);
    return {
      id,
      cf_refund_id: id,
      cf_payment_id: String(5114000000 + i * 137),
      refund_id: `refund_${i}`,
      order_id: `HN-demo${i}abcdefg-1`,
      refund_amount: amount,
      refund_currency: "INR",
      refund_status: i === 0 ? "PENDING" : i === 6 ? "CANCELLED" : "SUCCESS",
      refund_type: "MERCHANT_INITIATED",
      refund_note: [
        "Customer cancelled",
        "Nanny replacement not needed",
        "Duplicate payment",
        "Service not started",
      ][i % 4]!,
      refund_arn: i === 0 ? null : `20590701${4000 + i}`,
      status_description: null,
      refund_created_at: at.toISOString(),
      refund_processed_at:
        i === 0 ? null : new Date(at.getTime() + 20 * 3600_000).toISOString(),
      source: "webhook",
      environment: "production",
      created_at: Timestamp.fromDate(at),
    };
  });
}

/** Sample settlements, roughly every 2–3 days (demo mode only). */
export function demoSettlements(now = new Date()): Settlement[] {
  const out: Settlement[] = [];
  for (let i = 0; i < 24; i++) {
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - i * 3,
      11,
      30,
    );
    const gross = [262000, 116000, 84000, 191000, 58000, 143000][i % 6]!;
    const charges = Math.round(gross * 0.0195 * 100) / 100;
    out.push({
      id: String(312048765 - i * 7),
      status: i === 0 ? "PENDING_WITH_BANK" : "SUCCESS",
      statusDescription: null,
      utr: i === 0 ? null : `CB0${312048765 - i * 7}`,
      paymentFrom: new Date(at.getTime() - 3 * 86400000).toISOString(),
      paymentTill: new Date(at.getTime() - 86400000).toISOString(),
      initiatedOn: at.toISOString(),
      processedOn: i === 0 ? null : at.toISOString(),
      paymentAmount: gross,
      charges,
      adjustment: i % 5 === 2 ? -4999 : 0,
      amountSettled:
        Math.round((gross - charges + (i % 5 === 2 ? -4999 : 0)) * 100) / 100,
      type: "NORMAL_SETTLEMENT",
    });
  }
  return out;
}

/** demoRefunds in the shape the live Refunds tab uses. */
export function demoLiveRefunds(now = new Date()): LiveRefund[] {
  return demoRefunds(now).map((r) => ({
    id: r.id,
    cfRefundId: r.cf_refund_id,
    refundId: r.refund_id,
    orderId: r.order_id,
    cfPaymentId: r.cf_payment_id,
    amount: r.refund_amount,
    currency: r.refund_currency,
    status: r.refund_status,
    eventTime: r.refund_created_at,
    processedAt: r.refund_processed_at,
    arn: r.refund_arn,
    note: r.refund_note,
    customerName: ["Ananya Rao", "Rahul Menon", "Meera Nair"][
      Number(r.id) % 3
    ]!,
    customerPhone: "9845012345",
    settled: r.refund_status === "SUCCESS",
  }));
}

/** Servicing pages in demo mode. Set NEXT_PUBLIC_OPS_DEMO_ROLE=servicing to see what the servicing team sees. */
export const DEMO_SERVICING_STAFF: Staff = {
  uid: "demo-s",
  email: "ravi@heynanny.in",
  name: "Ravi Kumar",
  photo: null,
  role:
    (process.env.NEXT_PUBLIC_OPS_DEMO_ROLE as StaffRole | undefined) ?? "admin",
};

export function demoNannies(): Nanny[] {
  const rows: [
    string,
    string,
    number,
    number,
    string[],
    Nanny["workType"],
    string,
    Nanny["status"],
    string[],
  ][] = [
    [
      "Akka Mahadevi B.",
      "Japa Nanny",
      36,
      8,
      ["Kannada", "Hindi"],
      "live_in",
      "Bommanahalli",
      "available",
      ["Newborn care", "Massage", "Cooking"],
    ],
    [
      "Paravva",
      "Japa Nanny",
      38,
      7,
      ["Kannada"],
      "live_in",
      "Hosur Road",
      "available",
      ["Newborn care", "Mother care"],
    ],
    [
      "Uma GP",
      "Nanny",
      27,
      4,
      ["Kannada", "Hindi"],
      "day",
      "Hulimavu",
      "interviewing",
      ["Toddler activities", "First aid"],
    ],
    [
      "Lakshmi R.",
      "Nanny",
      31,
      6,
      ["Tamil", "Kannada", "English"],
      "both",
      "HSR Layout",
      "available",
      ["Homework help", "Cooking"],
    ],
    [
      "Shanthamma",
      "Nanny",
      42,
      12,
      ["Kannada", "Telugu"],
      "live_in",
      "Electronic City",
      "placed",
      ["Twins", "Newborn care"],
    ],
    [
      "Rekha D.",
      "Nanny",
      29,
      3,
      ["Hindi", "English"],
      "day",
      "Koramangala",
      "available",
      ["Toddler activities"],
    ],
    [
      "Sumitra",
      "Japa Nanny",
      45,
      15,
      ["Telugu", "Hindi"],
      "live_in",
      "Marathahalli",
      "on_leave",
      ["Newborn care", "Massage"],
    ],
    [
      "Jyothi K.",
      "Nanny",
      34,
      9,
      ["Kannada", "English"],
      "day",
      "Jayanagar",
      "available",
      ["First aid", "Cooking"],
    ],
  ];
  return rows.map(
    ([name, role, age, exp, languages, workType, area, status, skills], i) => ({
      id: `nanny${i + 1}`,
      name,
      phone: `98${String(45012300 + i * 1117).slice(0, 8)}`,
      altPhone: null,
      photoUrl: null,
      age,
      role,
      experienceYears: exp,
      languages,
      workType,
      area,
      city: "Bengaluru",
      skills,
      status,
      placement:
        status === "placed"
          ? {
              caseId: "case4",
              customerName: "Karthik Reddy",
              since: "2026-11-10",
            }
          : null,
      notes: i === 6 ? "Back from leave on 25 Nov." : "",
      createdAt: null,
      updatedAt: null,
    }),
  );
}

export function demoCases(now = new Date()): ServicingCase[] {
  const n = demoNannies();
  const ts = (hoursAgo: number) =>
    Timestamp.fromDate(new Date(now.getTime() - hoursAgo * 3600_000));
  const prop = (i: number, extra: Partial<Proposal> = {}): Proposal => ({
    nannyId: n[i]!.id,
    nanny: {
      name: n[i]!.name,
      photoUrl: null,
      role: n[i]!.role,
      age: n[i]!.age,
      experienceYears: n[i]!.experienceYears,
      languages: n[i]!.languages,
      workType: n[i]!.workType,
      area: n[i]!.area,
      skills: n[i]!.skills,
    },
    sharedAt: ts(30),
    sharedBy: "ravi@heynanny.in",
    shortlisted: false,
    interviewAt: null,
    interviewStatus: null,
    outcome: null,
    outcomeNote: null,
    ...extra,
  });
  const base = (
    id: string,
    name: string,
    phone: string,
    careType: string,
    area: string,
    paid: number,
    hoursAgo: number,
  ): ServicingCase => ({
    id,
    customer: { name, phone: `+91${phone}`, email: null },
    stage: "new",
    careType,
    area,
    leadId: null,
    bookingId: null,
    payments: [
      {
        cfPaymentId: `70${id}`,
        orderId: `CFPay_${id}`,
        amount: paid,
        paidAt: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(),
      },
    ],
    totalPaid: paid,
    proposals: [],
    placement: null,
    travel: null,
    cancellation: null,
    intake: null,
    assignedTo: "ravi@heynanny.in",
    source: "payment",
    createdAt: ts(hoursAgo),
    updatedAt: ts(hoursAgo / 2),
    updatedBy: "system",
  });
  return [
    {
      ...base(
        "case1",
        "Ananya Rao",
        "9845012345",
        "Live-In Nanny",
        "HSR Layout",
        18878,
        3,
      ),
      assignedTo: null,
    },
    {
      ...base(
        "case2",
        "Meera Nair",
        "9886554433",
        "Day Nanny",
        "Koramangala",
        11799,
        28,
      ),
      stage: "profiles_shared",
      proposals: [prop(3), prop(5), prop(7)],
      intake: {
        customerName: "Meera Nair",
        customerPhone: "+919886554433",
        altPhone: null,
        city: "Bengaluru",
        payment: "Full",
        amountPaid: 11799,
        careType: "Day Nanny",
        babyAge: "7 months",
        nannyAge: ["30-40", "40-50"],
        languages: ["Hindi", "Kannada"],
        location: "Koramangala 5th Block, near Forum Mall",
        locationGeo: {
          lat: 12.9345,
          lng: 77.6101,
          placeId: null,
          area: "Koramangala",
          city: "Bengaluru",
        },
        joiningDate: new Date(now.getTime() + 3 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        workingHours: "9 Hrs",
        startTime: "09:00",
        specificRequirement:
          "Vegetarian home. Should be comfortable with a pet dog. Light cooking for the baby.",
        submittedAt: ts(27),
        submittedBy: "bhupathi.murugan@heynanny.in",
        leadId: null,
      },
    },
    {
      ...base(
        "case3",
        "Divya Shetty",
        "9620443322",
        "Japa Care (newborn)",
        "Bellandur",
        20059,
        60,
      ),
      stage: "interviews",
      proposals: [
        prop(0, {
          shortlisted: true,
          interviewAt: Timestamp.fromDate(
            new Date(now.getTime() + 20 * 3600_000),
          ),
          interviewStatus: "scheduled",
        }),
        prop(1, {
          shortlisted: true,
          interviewAt: ts(4),
          interviewStatus: "done",
          outcome: "rejected",
          outcomeNote: "Family wanted Hindi speaker",
        }),
        prop(6),
      ],
    },
    {
      ...base(
        "case4",
        "Karthik Reddy",
        "7019887766",
        "Live-In Nanny",
        "Electronic City",
        35398,
        200,
      ),
      stage: "placed",
      proposals: [
        prop(4, {
          shortlisted: true,
          interviewAt: ts(170),
          interviewStatus: "done",
          outcome: "approved",
        }),
      ],
      placement: {
        nannyId: n[4]!.id,
        nanny: {
          name: n[4]!.name,
          photoUrl: null,
          role: n[4]!.role,
          age: n[4]!.age,
          experienceYears: n[4]!.experienceYears,
          languages: n[4]!.languages,
          workType: n[4]!.workType,
          area: n[4]!.area,
          skills: n[4]!.skills,
          phone: n[4]!.phone,
        },
        startDate: "2026-11-10",
        siteAddress: "Flat 402, Sobha Daffodil, HSR Layout",
        placedAt: ts(170),
        placedBy: "ravi@heynanny.in",
      },
      travel: {
        travelling: true,
        scope: "inter_city",
        mode: "train",
        ticketNumber: "4521873390",
        fromCity: "Kolkata",
        departAt: ts(190),
        arriveAt: ts(150),
        ticketNote: "Howrah – SMVT Bengaluru Express, coach S4",
        reachedPgAt: ts(148),
        reachedSiteAt: null,
        updatedBy: "ravi@heynanny.in",
      },
    },
    {
      ...base(
        "case5",
        "Sneha Kulkarni",
        "9731234567",
        "Live-In Nanny",
        "Whitefield",
        18878,
        90,
      ),
      stage: "approved",
      proposals: [
        prop(3, {
          shortlisted: true,
          interviewAt: ts(20),
          interviewStatus: "done",
          outcome: "approved",
        }),
        prop(7, { shortlisted: true }),
      ],
    },
    {
      ...base(
        "case6",
        "Rohit Menon",
        "9900112233",
        "Day Nanny",
        "Jayanagar",
        2360,
        50,
      ),
      stage: "cancelled",
      cancellation: {
        reason: "Customer changed their mind",
        note: "Grandmother moving in, no longer needs a nanny",
        cancelledAt: ts(20),
        cancelledBy: "ravi@heynanny.in",
        placedNanny: null,
        refund: {
          status: "pending",
          amount: 2360,
          refundedAt: null,
          reference: null,
          note: null,
          updatedBy: "ravi@heynanny.in",
        },
      },
    },
  ];
}
