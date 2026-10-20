import { AGE_GROUPS, CARE_TYPES, planName, serviceName } from "@/lib/catalog";
import { formatDateTime, toDate } from "@/lib/format";
import { requestId, STATUS_META, type Booking } from "@/lib/types";

const COLUMNS: [string, (b: Booking) => string | number][] = [
  ["Request ID", (b) => requestId(b)],
  ["Received", (b) => formatDateTime(toDate(b.createdAt))],
  ["Status", (b) => STATUS_META[b.status]?.label ?? b.status],
  ["Name", (b) => b.customer.name],
  // "98765 43210" (Indian numbers) so Excel keeps it as text instead of a number/formula.
  ["Phone", (b) => b.customer.phone.replace(/^\+91(\d{5})(\d{5})$/, "$1 $2")],
  ["Email", (b) => b.customer.email],
  ["Service", (b) => serviceName(b.serviceId)],
  ["Plan", (b) => planName(b.serviceId, b.planId)],
  ["Type of care", (b) => (b.bookingDetails.careType ? (CARE_TYPES[b.bookingDetails.careType] ?? b.bookingDetails.careType) : "")],
  ["Start date", (b) => b.bookingDetails.date],
  ["Start time", (b) => b.bookingDetails.startTime],
  ["Children", (b) => b.bookingDetails.children.length],
  ["Child ages", (b) => b.bookingDetails.children.map((c) => AGE_GROUPS[c.ageGroup] ?? c.ageGroup).join("; ")],
  ["Address", (b) => b.bookingDetails.address.line1],
  ["City", (b) => b.bookingDetails.address.city],
  ["Pincode", (b) => b.bookingDetails.address.pincode],
  ["Customer notes", (b) => b.bookingDetails.notes ?? ""],
  ["Plan price (excl. GST)", (b) => b.pricing.subtotal],
  ["GST", (b) => b.pricing.taxes],
  ["Total", (b) => b.pricing.totalAmount],
  ["Lead source", (b) => b.leadSource ?? ""],
  ["Assigned to", (b) => b.ops?.assignedTo ?? ""],
  ["Ops notes", (b) => b.ops?.notes ?? ""],
  ["Last updated by", (b) => b.ops?.updatedBy ?? ""],
];

function cell(v: string | number) {
  const s = String(v);
  // Quote everything; also stop Excel from treating values like "+91…" or "=…" as formulas.
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Downloads a CSV that opens directly in Excel / Google Sheets (UTF-8 with BOM). */
export function downloadCsv(bookings: Booking[], filename: string) {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(","), ...bookings.map((b) => COLUMNS.map(([, f]) => cell(f(b))).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
