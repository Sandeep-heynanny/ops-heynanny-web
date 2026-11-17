import { formatDateTime, toDate } from "@/lib/format";
import {
  CLOSE_REASONS,
  formName,
  leadOrigin,
  ORIGIN_META,
  leadRef,
  questionLabel,
  STATUS_META,
  type Lead,
} from "@/lib/types";

const COLUMNS: [string, (l: Lead) => string | number][] = [
  ["Reference", (l) => leadRef(l)],
  ["Received", (l) => formatDateTime(toDate(l.createdAt))],
  ["Status", (l) => STATUS_META[l.status]?.label ?? l.status],
  ["Name", (l) => l.name ?? ""],
  // "98765 43210" so Excel keeps it as text instead of a number.
  ["Phone", (l) => l.phone.replace(/^(\d{5})(\d{5})$/, "$1 $2")],
  ["Email", (l) => l.email ?? ""],
  ["Type of care", (l) => l.careType],
  ["Needed", (l) => l.when],
  ["Area", (l) => l.area],
  ["Channel", (l) => ORIGIN_META[leadOrigin(l)].label],
  ["Form", (l) => formName(l)],
  ["Page", (l) => l.page ?? ""],
  ["Lead source", (l) => l.leadSource ?? ""],
  ["Meta campaign", (l) => l.meta?.campaignName ?? ""],
  ["Meta ad set", (l) => l.meta?.adsetName ?? ""],
  ["Meta ad", (l) => l.meta?.adName ?? ""],
  [
    "Meta form answers",
    (l) =>
      (l.meta?.answers ?? [])
        .map((a) => `${questionLabel(a.question)}: ${a.answer}`)
        .join(" | "),
  ],
  ["Assigned to", (l) => l.ops?.assignedTo ?? ""],
  [
    "Outcome",
    (l) =>
      l.status === "not_interested" && l.ops?.closeReason
        ? (CLOSE_REASONS[l.ops.closeReason.category]?.label ?? "")
        : "",
  ],
  [
    "Reason",
    (l) =>
      l.status === "not_interested" ? (l.ops?.closeReason?.reason ?? "") : "",
  ],
  [
    "Call back",
    (l) =>
      l.status === "contacted"
        ? formatDateTime(toDate(l.ops?.callbackAt)).replace("—", "")
        : "",
  ],
  ["Ops notes", (l) => l.ops?.notes ?? ""],
  ["Last updated by", (l) => l.ops?.updatedBy ?? ""],
];

export function cell(v: string | number) {
  const s = String(v);
  // Quote everything; also stop Excel from treating values like "+91…" or "=…" as formulas.
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Downloads a CSV that opens directly in Excel / Google Sheets (UTF-8 with BOM). */
export function downloadCsv(leads: Lead[], filename: string) {
  const lines = [
    COLUMNS.map(([h]) => cell(h)).join(","),
    ...leads.map((l) => COLUMNS.map(([, f]) => cell(f(l))).join(",")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Any rows → CSV download (same Excel-friendly format as the enquiries export). */
export function downloadRows<T>(
  rows: T[],
  columns: [string, (r: T) => string | number][],
  filename: string,
) {
  const lines = [
    columns.map(([h]) => cell(h)).join(","),
    ...rows.map((r) => columns.map(([, f]) => cell(f(r))).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
