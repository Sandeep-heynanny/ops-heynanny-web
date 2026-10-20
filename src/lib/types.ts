import type { Timestamp } from "firebase/firestore";

/**
 * Ops workflow on top of the website's booking statuses:
 * pending (= New request) → contacted → confirmed / cancelled; completed later.
 */
export type BookingStatus = "pending" | "contacted" | "confirmed" | "cancelled" | "completed";

export const STATUS_META: Record<BookingStatus, { label: string; tone: string; dot: string }> = {
  pending: { label: "New", tone: "bg-blush text-rose-deep", dot: "bg-rose" },
  contacted: { label: "Contacted", tone: "bg-[#fbecc8] text-[#7a5410]", dot: "bg-[#d9a23a]" },
  confirmed: { label: "Confirmed", tone: "bg-[#dcefe1] text-success", dot: "bg-success" },
  cancelled: { label: "Cancelled", tone: "bg-beige text-muted", dot: "bg-muted/60" },
  completed: { label: "Completed", tone: "bg-plum/10 text-plum", dot: "bg-plum" },
};

export const STATUS_ORDER: BookingStatus[] = ["pending", "contacted", "confirmed", "cancelled", "completed"];

/** Fields only the ops team writes (Firestore rules allow staff to change nothing else). */
export type OpsFields = {
  notes?: string;
  assignedTo?: string;
  updatedBy?: string;
  contactedAt?: Timestamp;
  confirmedAt?: Timestamp;
  cancelledAt?: Timestamp;
  completedAt?: Timestamp;
};

/** A `bookings/{id}` document as the website writes it (src/lib/firebase/bookings.ts there). */
export type Booking = {
  id: string;
  userId: string;
  customer: { name: string; email: string; phone: string };
  serviceId: string;
  planId: string;
  nannyId?: string | null;
  leadSource?: string | null;
  bookingDetails: {
    date: string;
    startTime: string;
    careType?: string | null;
    children: { ageGroup: string }[];
    address: { line1: string; city: string; pincode: string };
    notes?: string | null;
  };
  pricing: { subtotal: number; taxes: number; discount: number; totalAmount: number; currency: "INR" };
  status: BookingStatus;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  ops?: OpsFields;
};

/** Same short reference the customer sees on the "Request received" screen. */
export function requestId(b: Pick<Booking, "id" | "bookingDetails">) {
  return `NAN-${b.bookingDetails.date.slice(0, 4)}-${b.id.slice(0, 6).toUpperCase()}`;
}
