import { Timestamp } from "firebase/firestore";

import type { Staff } from "@/lib/auth";
import type { Booking, BookingStatus } from "@/lib/types";

/**
 * Sample data for previewing the UI without signing in.
 * Only used when NEXT_PUBLIC_OPS_DEMO=1 (never set on the live dashboard).
 */
export const DEMO_STAFF: Staff = { uid: "demo", email: "priya@heynanny.in", name: "Priya Sharma", photo: null, role: "ops" };

const rows: [string, string, string, string, string, number, string, string, BookingStatus, string | null, string?][] = [
  // name, phone, service, plan, care, minutesAgo, city, pincode, status, lead, assigned
  ["Ananya Rao", "+919845012345", "baby-care", "together", "day", 6, "Bengaluru", "560102", "pending", "instagram"],
  ["Rahul Menon", "+919900112233", "japa", "comfort", "", 48, "Bengaluru", "560034", "pending", "whatsapp_hsr"],
  ["Sneha Kulkarni", "+919731234567", "baby-care", "family", "live-in", 190, "Bengaluru", "560066", "pending", null],
  ["Vikram Iyer", "+918147001122", "baby-care", "hello", "day", 60 * 20, "Bengaluru", "560076", "contacted", "google", "priya@heynanny.in"],
  ["Meera Nair", "+919886554433", "japa", "complete", "", 60 * 28, "Bengaluru", "560037", "contacted", "instagram", "arjun@heynanny.in"],
  ["Karthik Reddy", "+917019887766", "baby-care", "forever", "live-in", 60 * 52, "Bengaluru", "560103", "confirmed", "referral", "priya@heynanny.in"],
  ["Divya Shetty", "+919620443322", "baby-care", "together", "day", 60 * 75, "Bengaluru", "560038", "confirmed", null, "arjun@heynanny.in"],
  ["Aditya Joshi", "+919535667788", "japa", "comfort", "", 60 * 100, "Bengaluru", "560068", "cancelled", "instagram", "priya@heynanny.in"],
  ["Pooja Hegde", "+918884223311", "baby-care", "hello", "day", 60 * 130, "Bengaluru", "560095", "confirmed", "whatsapp_hsr", "priya@heynanny.in"],
];

const PRICES: Record<string, number> = { hello: 7999, together: 9999, family: 15999, forever: 29999, comfort: 16999, complete: 24999 };

export function demoBookings(now = new Date()): Booking[] {
  return rows.map(([name, phone, serviceId, planId, care, minsAgo, city, pincode, status, lead, assigned], i) => {
    const created = new Date(now.getTime() - minsAgo * 60_000);
    const start = new Date(created.getTime() + (3 + i) * 86_400_000);
    const price = PRICES[planId]!;
    const gst = Math.round(price * 0.18 * 100) / 100;
    return {
      id: `d${i}x7k2pq9w${i}`,
      userId: `anon-${i}`,
      customer: { name, phone, email: `${name.split(" ")[0]!.toLowerCase()}@example.com` },
      serviceId,
      planId,
      nannyId: null,
      leadSource: lead,
      bookingDetails: {
        date: start.toISOString().slice(0, 10),
        startTime: i % 2 ? "09:00" : "08:30",
        careType: care || null,
        children: serviceId === "japa" ? [{ ageGroup: "0-6m" }] : i % 3 === 0 ? [{ ageGroup: "6m-2y" }, { ageGroup: "2y+" }] : [{ ageGroup: "6m-2y" }],
        address: { line1: `${12 + i * 7}, ${["4th Cross", "Main Road", "2nd Block", "Lake View"][i % 4]}`, city, pincode },
        notes: i === 0 ? "Prefer a Kannada-speaking nanny. Please call after 6 PM." : null,
      },
      pricing: { subtotal: price, taxes: gst, discount: 0, totalAmount: price + gst, currency: "INR" },
      status,
      createdAt: Timestamp.fromDate(created),
      updatedAt: Timestamp.fromDate(created),
      ops: assigned ? { assignedTo: assigned, updatedBy: assigned, notes: status === "cancelled" ? "Found a relative to help. Follow up in 3 months." : undefined } : undefined,
    };
  });
}
