"use client";

import { Check, ClipboardList, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { PlacePicker } from "@/components/PlacePicker";
import {
  asksHours,
  checkServicingForm,
  FORM_CARE_TYPES,
  FORM_CITIES,
  FORM_HOURS,
  FORM_LANGUAGES,
  FORM_NANNY_AGES,
  FORM_PAYMENTS,
  type FormErrors,
  type ServicingFormInput,
  type ServicingFormValue,
} from "@/lib/servicing-form";

/**
 * The Servicing form (was a Google Form): filled by the sales team when an
 * enquiry is converted, or by servicing for a case without one. Pick-one
 * questions are pill buttons; pick-any questions are tick pills. The
 * requirement questions are the same for everyone (Source was dropped).
 * Every rule lives in checkServicingForm (also run on the server).
 */
export function ServicingForm({
  initial,
  submitLabel,
  onSubmit,
  extra,
  compact,
}: {
  initial: ServicingFormInput;
  submitLabel: string;
  onSubmit: (value: ServicingFormValue) => Promise<void>;
  /** Extra fields shown before the submit button (e.g. email, area on a new case). */
  extra?: ReactNode;
  compact?: boolean;
}) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const otherCity =
    !!f.city && !FORM_CITIES.includes(f.city as (typeof FORM_CITIES)[number]);
  const [cityOther, setCityOther] = useState(otherCity);
  const [langOther, setLangOther] = useState(!!initial.languageOther);

  const update = (next: ServicingFormInput, key: keyof ServicingFormInput) => {
    setF(next);
    // After a first submit attempt, re-check as they fix things.
    if (tried) {
      const r = checkServicingForm(next);
      setErrors(r.errors ?? {});
    } else setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const set = (k: keyof ServicingFormInput, v: string) =>
    update({ ...f, [k]: v }, k);
  const toggle = (k: "nannyAge" | "languages", v: string) =>
    update(
      {
        ...f,
        [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
      },
      k,
    );

  const submit = async () => {
    setTried(true);
    const r = checkServicingForm(f);
    if (r.errors) {
      setErrors(r.errors);
      // Bring the first problem into view.
      window.setTimeout(
        () =>
          document
            .querySelector("[data-form-error]")
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        0,
      );
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await onSubmit(r.value);
    } catch (e) {
      setFailed((e as Error).message || "Couldn't submit. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const hours = asksHours(f);
  const errorCount = Object.values(errors).filter(Boolean).length;
  const input = (bad?: string) =>
    `mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none ${bad ? "border-red-400" : "border-line"}`;

  return (
    <div className={compact ? "space-y-3.5" : "space-y-4"}>
      {/* ---- Customer & payment ---- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name *" error={errors.customerName}>
          <input
            value={f.customerName}
            onChange={(e) => set("customerName", e.target.value)}
            className={input(errors.customerName)}
            maxLength={120}
          />
        </Field>
        <Field label="Customer number *" error={errors.customerPhone}>
          <input
            value={f.customerPhone}
            onChange={(e) => set("customerPhone", e.target.value)}
            inputMode="tel"
            placeholder="98765 43210"
            className={input(errors.customerPhone)}
            maxLength={16}
          />
        </Field>
        <Field label="Alternate number (if any)" error={errors.altPhone}>
          <input
            value={f.altPhone}
            onChange={(e) => set("altPhone", e.target.value)}
            inputMode="tel"
            className={input(errors.altPhone)}
            maxLength={16}
          />
        </Field>
        <Field label="Amount paid (₹) *" error={errors.amountPaid}>
          <input
            value={f.amountPaid}
            onChange={(e) =>
              set("amountPaid", e.target.value.replace(/[^\d.,]/g, ""))
            }
            inputMode="decimal"
            placeholder="e.g. 11799"
            className={input(errors.amountPaid)}
            maxLength={12}
          />
        </Field>
      </div>

      <Choice label="City *" error={errors.city}>
        {FORM_CITIES.map((c) => (
          <Pill
            key={c}
            on={!cityOther && f.city === c}
            onClick={() => {
              setCityOther(false);
              set("city", c);
            }}
          >
            {c}
          </Pill>
        ))}
        <Pill
          on={cityOther}
          onClick={() => {
            setCityOther(true);
            if (!otherCity) set("city", "");
          }}
        >
          Other
        </Pill>
        {cityOther && (
          <input
            value={f.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="City name"
            autoFocus
            className="h-9 w-40 rounded-full border border-line bg-white px-3 text-sm text-plum"
            maxLength={60}
          />
        )}
      </Choice>

      <Choice label="Payment *" error={errors.payment}>
        {FORM_PAYMENTS.map((p) => (
          <Pill key={p} on={f.payment === p} onClick={() => set("payment", p)}>
            {p}
          </Pill>
        ))}
      </Choice>

      <Choice label="Care type *" error={errors.careType}>
        {FORM_CARE_TYPES.map((c) => (
          <Pill
            key={c}
            on={f.careType === c}
            onClick={() => set("careType", c)}
          >
            {c}
          </Pill>
        ))}
      </Choice>

      {/* ---- Requirements ---- */}
      <div className="space-y-3.5 rounded-xl bg-white/70 p-3 ring-1 ring-line">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Requirement
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Baby age *" error={errors.babyAge}>
            <input
              value={f.babyAge}
              onChange={(e) => set("babyAge", e.target.value)}
              placeholder="e.g. 4 months, or Due 10 Jan"
              className={input(errors.babyAge)}
              maxLength={60}
            />
          </Field>
          <Field label="Preferred joining date *" error={errors.joiningDate}>
            <input
              type="date"
              value={f.joiningDate}
              onChange={(e) => set("joiningDate", e.target.value)}
              className={input(errors.joiningDate)}
            />
          </Field>
        </div>
        <div className="block text-xs font-semibold text-muted">
          Location *
          <PlacePicker
            address={f.location}
            geo={f.locationGeo}
            invalid={!!errors.location}
            onChange={({ address, geo }) =>
              update({ ...f, location: address, locationGeo: geo }, "location")
            }
          />
          {errors.location && (
            <span
              data-form-error
              className="mt-1 block font-normal text-red-700"
            >
              {errors.location}
            </span>
          )}
        </div>

        <>
          <Choice
            label="Nanny age requirement * (pick any)"
            error={errors.nannyAge}
          >
            {FORM_NANNY_AGES.map((a) => (
              <Pill
                key={a}
                multi
                on={f.nannyAge.includes(a)}
                onClick={() => toggle("nannyAge", a)}
              >
                {a}
              </Pill>
            ))}
          </Choice>
          <Choice
            label="Nanny language requirement * (pick any)"
            error={errors.languages ?? errors.languageOther}
          >
            {FORM_LANGUAGES.map((l) => (
              <Pill
                key={l}
                multi
                on={f.languages.includes(l)}
                onClick={() => toggle("languages", l)}
              >
                {l}
              </Pill>
            ))}
            <Pill
              multi
              on={langOther}
              onClick={() => {
                if (langOther) set("languageOther", "");
                setLangOther(!langOther);
              }}
            >
              Other
            </Pill>
            {langOther && (
              <input
                value={f.languageOther}
                onChange={(e) => set("languageOther", e.target.value)}
                placeholder="e.g. Odia, Marathi"
                autoFocus
                className="h-9 w-48 rounded-full border border-line bg-white px-3 text-sm text-plum"
                maxLength={120}
              />
            )}
          </Choice>
        </>

        {hours && (
          <>
            <Choice
              label="Working hours * (day nanny)"
              error={errors.workingHours}
            >
              {FORM_HOURS.map((h) => (
                <Pill
                  key={h}
                  on={f.workingHours === h}
                  onClick={() => set("workingHours", h)}
                >
                  {h}
                </Pill>
              ))}
            </Choice>
            <Field
              label="Preferred start time (day nanny)"
              error={errors.startTime}
            >
              <input
                type="time"
                value={f.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={`${input(errors.startTime)} block sm:max-w-[200px]`}
              />
            </Field>
          </>
        )}

        <Field
          label="Any specific requirement *"
          error={errors.specificRequirement}
        >
          <textarea
            value={f.specificRequirement}
            onChange={(e) => set("specificRequirement", e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Cooking, twins, pets at home, vegetarian only… or “None”"
            className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-plum focus:border-plum focus:outline-none ${errors.specificRequirement ? "border-red-400" : "border-line"}`}
          />
        </Field>
      </div>

      {extra}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#5b3cc4] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ClipboardList className="size-4" aria-hidden="true" />
          )}
          {busy ? "Submitting…" : submitLabel}
        </button>
        {errorCount > 0 && (
          <span className="text-xs text-red-700" role="alert">
            {errorCount === 1
              ? "1 question needs fixing."
              : `${errorCount} questions need fixing.`}
          </span>
        )}
        {failed && (
          <span className="text-xs text-red-700" role="alert">
            {failed}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      {children}
      {error && (
        <span data-form-error className="mt-1 block font-normal text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

function Choice({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label.replace(/ \*.*$/, "")}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>
      {error && (
        <p data-form-error className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function Pill({
  on,
  multi,
  onClick,
  children,
}: {
  on: boolean;
  multi?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${on ? "bg-plum text-milk" : "bg-white text-plum ring-1 ring-line hover:bg-milk"}`}
    >
      {multi && on && <Check className="size-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}
