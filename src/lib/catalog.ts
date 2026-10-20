/**
 * Display labels for what the website saves on a booking.
 * Copied from the website repo (src/config/services.ts, content.ts):
 * keep in sync when services or plans change there.
 */
export const SERVICES: Record<string, { name: string; plans: Record<string, string> }> = {
  "baby-care": {
    name: "Baby Care",
    plans: { hello: "Hello · 1 month", together: "Together · 3 months", family: "Family · 6 months", forever: "Forever · 12 months" },
  },
  japa: {
    name: "Japa Care",
    plans: { comfort: "Comfort · 3 months", complete: "Complete · 6 months" },
  },
  flexi: { name: "Flexi Care", plans: {} },
  elderly: { name: "Elderly Care", plans: {} },
};

export const CARE_TYPES: Record<string, string> = { day: "Day Nanny", "live-in": "Live-In Nanny" };

export const AGE_GROUPS: Record<string, string> = {
  "0-6m": "0–6 months",
  "6m-2y": "6 months–2 years",
  "2y+": "2+ years",
};

export const serviceName = (id: string) => SERVICES[id]?.name ?? id;
export const planName = (serviceId: string, planId: string) => SERVICES[serviceId]?.plans[planId] ?? planId;
