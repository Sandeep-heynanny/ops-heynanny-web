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
