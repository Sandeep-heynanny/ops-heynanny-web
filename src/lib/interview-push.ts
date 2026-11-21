/**
 * Interview updates the customer gets as a push notification in the app.
 * Shared by the dashboard (which decides when to send) and the notify API
 * (which writes the message).
 */
export type InterviewEvent = "confirmed" | "rescheduled" | "cancelled" | "unavailable" | "suggested";

/** "Mon, 23 Nov · 10:15 AM" in India time. */
export function istWhen(d: Date) {
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).toUpperCase();
  return `${day} · ${time}`;
}

export function interviewMessage(event: InterviewEvent, nannyName: string, at: Date | null, note?: string | null) {
  const her = nannyName.trim().split(/\s+/)[0] || "your nanny";
  const when = at ? istWhen(at) : null;
  const extra = note?.trim() ? `\n${note.trim()}` : "";
  switch (event) {
    case "confirmed":
      return { title: "Interview booked", body: `Your interview with ${her} is on ${when}.${extra}` };
    case "rescheduled":
      return { title: "Interview time changed", body: `Your interview with ${her} is now on ${when}.${extra}` };
    case "cancelled":
      return {
        title: "Interview cancelled",
        body: `Your interview with ${her}${when ? ` on ${when}` : ""} has been cancelled. Open the app to pick another time.${extra}`,
      };
    case "unavailable":
      return {
        title: "Please pick another time",
        body: `${her} isn't free${when ? ` on ${when}` : " then"}. Open the app to suggest another time.${extra}`,
      };
    case "suggested":
      return {
        title: `${her} can meet you ${when}`,
        body: `Suggest ${when} in the app to book the interview, or pick a time that suits you.${extra}`,
      };
  }
}

type P = { interviewAt: { toMillis(): number } | null; interviewStatus: string | null };

/** What changed between two saves of a proposal, if the customer should hear about it. */
export function interviewChange(before: P, after: P, now = Date.now()): InterviewEvent | null {
  const wasBooked = !!before.interviewAt && before.interviewStatus === "scheduled";
  const isBooked = !!after.interviewAt && after.interviewStatus === "scheduled" && after.interviewAt.toMillis() > now;
  if (wasBooked && (!after.interviewAt || after.interviewStatus === "cancelled")) return "cancelled";
  if (!isBooked) return null;
  if (!wasBooked) return "confirmed";
  return before.interviewAt!.toMillis() !== after.interviewAt!.toMillis() ? "rescheduled" : null;
}
