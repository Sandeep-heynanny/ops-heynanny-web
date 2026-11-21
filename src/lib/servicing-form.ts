import { validGeo, type GeoPlace } from "@/lib/geo";

/**
 * The Servicing form: what the sales team fills in after an enquiry is
 * converted (replaces the "Servicing Form" Google Form). A customer moves on to
 * the servicing steps only once it's filled. Shared by the browser and the
 * server route, which checks it again.
 *
 * Source (Servicing / Replacement / Flexi-Care) was dropped (Sandeep,
 * 2026-11-17), so everyone answers the same requirement questions; working
 * hours and start time are asked for day nannies and Flexi-Care. Flexi-Care
 * (added as a care type 2026-11-20) also asks the number of days.
 */
export const FORM_CITIES = [
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
  "Pune",
  "Delhi NCR",
] as const;
export const FORM_PAYMENTS = ["Half", "Full", "Pre", "Token"] as const;
export const FORM_CARE_TYPES = [
  "Day Nanny",
  "Live-In Nanny",
  "Japa Nanny",
  "Flexi-Care",
] as const;
export const FORM_NANNY_AGES = ["20-30", "30-40", "40-50", "50+"] as const;
export const FORM_LANGUAGES = [
  "Hindi",
  "Kannada",
  "Telugu",
  "Tamil",
  "Malayalam",
  "Bengali",
  "English",
] as const;
export const FORM_HOURS = [
  "7 Hrs",
  "8 Hrs",
  "9 Hrs",
  "10 Hrs",
  "24 Hrs",
] as const;

export type FormPayment = (typeof FORM_PAYMENTS)[number];
export type FormCareType = (typeof FORM_CARE_TYPES)[number];

/** As typed in the form. */
export type ServicingFormInput = {
  customerName: string;
  customerPhone: string;
  altPhone: string;
  city: string;
  payment: string;
  amountPaid: string;
  careType: string;
  babyAge: string;
  nannyAge: string[];
  languages: string[];
  /** "Other" language(s), typed. */
  languageOther: string;
  location: string;
  /** From the Google Maps picker (needed to suggest nearby nannies). */
  locationGeo: GeoPlace | null;
  /** YYYY-MM-DD */
  joiningDate: string;
  workingHours: string;
  /** HH:MM */
  startTime: string;
  /** Flexi-Care: how many days were booked. */
  flexiDays: string;
  specificRequirement: string;
};

/** As stored on the servicing case (`intake`) and the enquiry (`ops.servicingForm`). */
export type ServicingFormValue = {
  customerName: string;
  /** +91XXXXXXXXXX */
  customerPhone: string;
  altPhone: string | null;
  city: string;
  payment: FormPayment;
  amountPaid: number;
  careType: FormCareType;
  /** Only on forms saved before Source was dropped. */
  source?: string;
  babyAge: string;
  /** Servicing / Replacement only. */
  nannyAge: string[];
  /** Servicing / Replacement only; includes any typed "Other" languages. */
  languages: string[];
  location: string;
  locationGeo: GeoPlace | null;
  joiningDate: string;
  workingHours: string | null;
  startTime: string | null;
  /** Flexi-Care only: days booked. */
  flexiDays?: number | null;
  specificRequirement: string | null;
};

const tenDigits = (v: string) => v.replace(/\D/g, "").slice(-10);
const validMobile = (v: string) =>
  /^[6-9]\d{9}$/.test(tenDigits(v)) && v.replace(/\D/g, "").length >= 10;
/** Working hours and start time are asked for day nannies and Flexi-Care. */
export const asksHours = (f: Pick<ServicingFormInput, "careType">) =>
  f.careType === "Day Nanny" || f.careType === "Flexi-Care";
/** Number of days is asked for Flexi-Care. */
export const asksDays = (f: Pick<ServicingFormInput, "careType">) =>
  f.careType === "Flexi-Care";

export type FormErrors = Partial<Record<keyof ServicingFormInput, string>>;

export function checkServicingForm(
  f: ServicingFormInput,
):
  | { value: ServicingFormValue; errors: null }
  | { value: null; errors: FormErrors } {
  const errors: FormErrors = {};
  const name = f.customerName.trim();
  if (!name) errors.customerName = "Enter the customer's name.";
  else if (name.length > 120) errors.customerName = "Too long.";
  if (!validMobile(f.customerPhone))
    errors.customerPhone = "Enter a 10-digit mobile number.";
  if (f.altPhone.trim() && !validMobile(f.altPhone))
    errors.altPhone = "Enter a 10-digit mobile number, or leave it empty.";
  else if (
    f.altPhone.trim() &&
    tenDigits(f.altPhone) === tenDigits(f.customerPhone)
  )
    errors.altPhone =
      "Same as the customer number. Leave it empty if there's no other number.";
  const city = f.city.trim();
  if (!city) errors.city = "Pick a city.";
  else if (city.length > 60) errors.city = "Too long.";
  if (!FORM_PAYMENTS.includes(f.payment as FormPayment))
    errors.payment = "Pick a payment type.";
  const amount = Number(f.amountPaid.replace(/[,\s₹]/g, ""));
  if (!f.amountPaid.trim() || !Number.isFinite(amount) || amount <= 0)
    errors.amountPaid = "Enter the amount paid.";
  else if (amount > 1_000_000) errors.amountPaid = "That looks too high.";
  if (!FORM_CARE_TYPES.includes(f.careType as FormCareType))
    errors.careType = "Pick a care type.";

  const babyAge = f.babyAge.trim();
  if (!babyAge)
    errors.babyAge = "Enter the baby's age (e.g. 4 months, or Expected Jan).";
  else if (babyAge.length > 60) errors.babyAge = "Too long.";
  const location = f.location.trim();
  if (!location) errors.location = "Enter the location (area / address).";
  else if (location.length > 300) errors.location = "Too long.";
  else if (f.locationGeo && !validGeo(f.locationGeo))
    errors.location = "That map location isn't in India. Pick it again.";
  // With map search set up, the location must be picked from it (for nearby nannies).
  else if (MAPS_REQUIRED && !f.locationGeo)
    errors.location = "Pick the location from the map suggestions.";
  const joining = /^\d{4}-\d{2}-\d{2}$/.test(f.joiningDate)
    ? new Date(`${f.joiningDate}T00:00:00+05:30`)
    : null;
  const dayMs = 86_400_000;
  if (!joining || Number.isNaN(joining.getTime()))
    errors.joiningDate = "Pick the preferred joining date.";
  else if (joining.getTime() < Date.now() - 60 * dayMs)
    errors.joiningDate = "That's more than 2 months ago. Check the date.";
  else if (joining.getTime() > Date.now() + 366 * dayMs)
    errors.joiningDate = "That's more than a year away. Check the date.";
  const startTime = f.startTime.trim();
  if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))
    errors.startTime = "Pick a time.";

  const hours = f.workingHours.trim();
  const others = f.languageOther
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const languages = [
    ...new Set([
      ...f.languages.filter((l) =>
        (FORM_LANGUAGES as readonly string[]).includes(l),
      ),
      ...others,
    ]),
  ];
  const nannyAge = f.nannyAge.filter((a) =>
    (FORM_NANNY_AGES as readonly string[]).includes(a),
  );
  const specific = f.specificRequirement.trim();
  {
    if (!nannyAge.length) errors.nannyAge = "Pick at least one age range.";
    if (!languages.length) errors.languages = "Pick at least one language.";
    else if (languages.some((l) => l.length > 30))
      errors.languageOther = "Keep each language short.";
    if (
      asksHours(f) &&
      !(FORM_HOURS as readonly string[]).includes(hours)
    )
      errors.workingHours = "Pick the working hours.";
    if (asksDays(f)) {
      const d = Number(f.flexiDays.trim());
      if (!f.flexiDays.trim() || !Number.isInteger(d) || d < 1)
        errors.flexiDays = "Enter the number of days.";
      else if (d > 365) errors.flexiDays = "That looks too many. Check it.";
    }
    if (!specific)
      errors.specificRequirement =
        "Write any specific requirement (or “None”).";
    else if (specific.length > 2000) errors.specificRequirement = "Too long.";
  }

  if (Object.keys(errors).length) return { value: null, errors };
  const dayish = asksHours(f);
  return {
    errors: null,
    value: {
      customerName: name,
      customerPhone: `+91${tenDigits(f.customerPhone)}`,
      altPhone: f.altPhone.trim() ? `+91${tenDigits(f.altPhone)}` : null,
      city,
      payment: f.payment as FormPayment,
      amountPaid: Math.round(amount * 100) / 100,
      careType: f.careType as FormCareType,
      babyAge,
      nannyAge,
      languages,
      location,
      locationGeo: f.locationGeo ? cleanGeo(f.locationGeo) : null,
      joiningDate: f.joiningDate,
      workingHours: dayish && hours ? hours : null,
      startTime: dayish && startTime ? startTime : null,
      flexiDays: asksDays(f) ? Number(f.flexiDays.trim()) : null,
      specificRequirement: specific,
    },
  };
}

/** Best guess at the form's care type from an enquiry's "Day Nanny - baby 3 months+" style text. */
export function guessCareType(
  careType: string | null | undefined,
): FormCareType | "" {
  const t = (careType ?? "").toLowerCase();
  if (t.includes("flexi")) return "Flexi-Care";
  if (t.includes("japa") || t.includes("newborn")) return "Japa Nanny";
  if (t.includes("live")) return "Live-In Nanny";
  if (t.includes("day")) return "Day Nanny";
  return "";
}

export const emptyForm = (
  prefill: Partial<ServicingFormInput> = {},
): ServicingFormInput => ({
  customerName: "",
  customerPhone: "",
  altPhone: "",
  city: "Bengaluru",
  payment: "",
  amountPaid: "",
  careType: "",
  babyAge: "",
  nannyAge: [],
  languages: [],
  languageOther: "",
  location: "",
  locationGeo: null,
  joiningDate: "",
  workingHours: "",
  startTime: "",
  flexiDays: "",
  specificRequirement: "",
  ...prefill,
});

/** A saved form back into the editable shape (older saves may lack the newer questions). */
export function formInputFromValue(
  v: Partial<ServicingFormValue>,
): ServicingFormInput {
  const langs = v.languages ?? [];
  return emptyForm({
    customerName: v.customerName ?? "",
    customerPhone: (v.customerPhone ?? "").slice(-10),
    altPhone: v.altPhone?.slice(-10) ?? "",
    city: v.city ?? "Bengaluru",
    payment: v.payment ?? "",
    amountPaid: v.amountPaid ? String(v.amountPaid) : "",
    careType: v.careType ?? "",
    babyAge: v.babyAge ?? "",
    nannyAge: v.nannyAge ?? [],
    languages: langs.filter((l) =>
      (FORM_LANGUAGES as readonly string[]).includes(l),
    ),
    languageOther: langs
      .filter((l) => !(FORM_LANGUAGES as readonly string[]).includes(l))
      .join(", "),
    location: v.location ?? "",
    locationGeo: v.locationGeo ?? null,
    joiningDate: v.joiningDate ?? "",
    workingHours: v.workingHours ?? "",
    startTime: v.startTime ?? "",
    flexiDays: v.flexiDays ? String(v.flexiDays) : "",
    specificRequirement: v.specificRequirement ?? "",
  });
}

/** Reads the form from an untrusted request body (server). */
export function formInputFromUnknown(raw: unknown): ServicingFormInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (k: string, max = 2000) =>
    typeof r[k] === "string" ? (r[k] as string).slice(0, max) : "";
  const list = (k: string) =>
    Array.isArray(r[k])
      ? (r[k] as unknown[])
          .filter((x): x is string => typeof x === "string")
          .slice(0, 20)
          .map((x) => x.slice(0, 40))
      : [];
  return {
    customerName: str("customerName", 200),
    customerPhone: str("customerPhone", 30),
    altPhone: str("altPhone", 30),
    city: str("city", 100),
    payment: str("payment", 20),
    amountPaid:
      typeof r.amountPaid === "number" && Number.isFinite(r.amountPaid)
        ? String(r.amountPaid)
        : str("amountPaid", 20),
    careType: str("careType", 40),
    babyAge: str("babyAge", 100),
    nannyAge: list("nannyAge"),
    // A saved form keeps typed "Other" languages in `languages`; split them back out.
    languages: list("languages").filter((l) =>
      (FORM_LANGUAGES as readonly string[]).includes(l),
    ),
    languageOther: [
      str("languageOther", 200),
      ...list("languages").filter(
        (l) => !(FORM_LANGUAGES as readonly string[]).includes(l),
      ),
    ]
      .filter(Boolean)
      .join(", "),
    location: str("location", 400),
    locationGeo: geoFromUnknown(r.locationGeo),
    joiningDate: str("joiningDate", 20),
    workingHours:
      typeof r.workingHours === "string" ? r.workingHours.slice(0, 60) : "",
    startTime: typeof r.startTime === "string" ? r.startTime.slice(0, 10) : "",
    flexiDays:
      typeof r.flexiDays === "number" && Number.isFinite(r.flexiDays)
        ? String(r.flexiDays)
        : str("flexiDays", 10),
    specificRequirement:
      typeof r.specificRequirement === "string"
        ? r.specificRequirement.slice(0, 2100)
        : "",
  };
}

/** Map search is on when the key is set (browser and server read the same setting). */
const MAPS_REQUIRED = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const shortStr = (v: unknown, max = 120) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function cleanGeo(g: GeoPlace): GeoPlace {
  return {
    lat: Number(g.lat.toFixed(6)),
    lng: Number(g.lng.toFixed(6)),
    placeId: shortStr(g.placeId, 300),
    area: shortStr(g.area),
    city: shortStr(g.city),
    ...(g.pinMoved ? { pinMoved: true } : {}),
  };
}

function geoFromUnknown(v: unknown): GeoPlace | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const g = {
    lat: Number(r.lat),
    lng: Number(r.lng),
    placeId: shortStr(r.placeId, 300),
    area: shortStr(r.area),
    city: shortStr(r.city),
    pinMoved: r.pinMoved === true,
  };
  // Bad numbers are caught by checkServicingForm ("isn't in India").
  return g;
}
