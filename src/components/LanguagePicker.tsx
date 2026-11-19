"use client";

import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FORM_LANGUAGES } from "@/lib/servicing-form";

/** The customer form's languages first (so matching lines up), then a few more. */
export const NANNY_LANGUAGES = [
  ...FORM_LANGUAGES,
  "Marathi",
  "Odia",
  "Urdu",
  "Nepali",
  "Assamese",
];

/** Dropdown with a checklist of languages; pick as many as she speaks. */
export function LanguagePicker({
  value,
  onChange,
  invalid = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  const has = (l: string) =>
    value.some((v) => v.toLowerCase() === l.toLowerCase());
  const toggle = (l: string) =>
    onChange(
      has(l)
        ? value.filter((v) => v.toLowerCase() !== l.toLowerCase())
        : [...value, l],
    );
  const addOther = () => {
    const l = other.trim().replace(/\s+/g, " ");
    if (!l) return;
    const nice = l[0]!.toUpperCase() + l.slice(1);
    if (!has(nice)) onChange([...value, nice]);
    setOther("");
  };
  // Any saved or imported language that isn't in the list still shows up.
  const options = [
    ...NANNY_LANGUAGES,
    ...value.filter(
      (v) => !NANNY_LANGUAGES.some((l) => l.toLowerCase() === v.toLowerCase()),
    ),
  ];

  return (
    <div ref={box} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex min-h-10 w-full items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 text-left text-sm text-plum focus:border-plum focus:outline-none ${invalid ? "border-red-400" : "border-line"}`}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="px-1 text-muted">Select languages</span>
          ) : (
            value.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1 rounded-full bg-milk py-0.5 pl-2.5 pr-1 text-xs font-semibold text-plum ring-1 ring-line"
              >
                {l}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${l}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(l);
                  }}
                  className="grid size-4 place-items-center rounded-full text-muted hover:bg-white hover:text-plum"
                >
                  <X className="size-3" aria-hidden="true" />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-line">
          <ul
            role="listbox"
            aria-multiselectable="true"
            className="max-h-60 overflow-y-auto"
          >
            {options.map((l) => {
              const on = has(l);
              return (
                <li key={l}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(l)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-plum hover:bg-milk"
                  >
                    <span
                      className={`grid size-4.5 shrink-0 place-items-center rounded border ${on ? "border-plum bg-plum text-milk" : "border-line bg-white"}`}
                    >
                      {on && <Check className="size-3" aria-hidden="true" />}
                    </span>
                    {l}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex items-center gap-1.5 border-t border-line px-1 pt-1.5">
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOther();
                }
              }}
              maxLength={30}
              placeholder="Another language"
              className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-sm text-plum focus:border-plum focus:outline-none"
            />
            <button
              type="button"
              onClick={addOther}
              disabled={!other.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-plum px-3 text-xs font-semibold text-milk disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
