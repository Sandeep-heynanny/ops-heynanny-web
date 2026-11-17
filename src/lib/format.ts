import type { Timestamp } from "firebase/firestore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-26" → "26 Sep 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m > 12) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "14:30" → "2:30 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** wa.me needs digits only, with country code. */
export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCc = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCc}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatINR = (n: number) => inr.format(n);

export const toDate = (t: Timestamp | null | undefined) => (t ? t.toDate() : null);

/** "Just now", "12 min ago", "3 h ago", "Yesterday, 4:10 PM", "12 Oct, 9:05 AM" */
export function formatReceived(d: Date | null, now = new Date()): string {
  if (!d) return "Just now";
  const diff = (now.getTime() - d.getTime()) / 60000;
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toUpperCase();
  if (diff < 1) return "Just now";
  if (diff < 60) return `${Math.floor(diff)} min ago`;
  if (isSameDay(d, now) && diff < 6 * 60) return `${Math.floor(diff / 60)} h ago`;
  if (isSameDay(d, now)) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (isSameDay(d, y)) return `Yesterday, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

export function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toUpperCase();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function localISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date → value for <input type="datetime-local"> in local time ("2026-11-18T10:00"). */
export function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → Date (local time), or null. */
export function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type CallbackState = "overdue" | "today" | "later";

export function callbackState(d: Date, now = new Date()): CallbackState {
  if (d <= now) return "overdue";
  return isSameDay(d, now) ? "today" : "later";
}

/** "Today, 4 PM" / "Tomorrow, 10 AM" / "18 Nov, 10 AM" (with "Overdue · " when past). */
export function formatCallback(d: Date, now = new Date()): string {
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toUpperCase().replace(":00 ", " ");
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const day = isSameDay(d, now)
    ? "Today"
    : isSameDay(d, tomorrow)
      ? "Tomorrow"
      : isSameDay(d, yesterday)
        ? "Yesterday"
        : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d <= now ? "Overdue · " : ""}${day}, ${time}`;
}
