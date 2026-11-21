import { adminDb } from "@/lib/server/admin";

/**
 * Push notifications to the customer app (Expo push service). The app saves
 * its token through the website (/api/app/push-token) into Firestore
 * `pushTokens/{id}` = { token, phone, … }; here we look them up by phone.
 * Optional env EXPO_ACCESS_TOKEN, only if "enhanced security" is on in Expo.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  title: string;
  body: string;
  /** Read by the app when the notification is tapped. */
  data?: Record<string, string>;
};

/** Sends to every device signed in with this phone. Returns how many accepted it. */
export async function pushToPhone(phone: string, msg: PushMessage): Promise<{ devices: number; sent: number }> {
  const snap = await adminDb().collection("pushTokens").where("phone", "==", phone).get();
  if (snap.empty) return { devices: 0, sent: 0 };
  const docs = snap.docs;
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(
      docs.map((d) => ({
        to: d.get("token"),
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: "default",
        priority: "high",
        channelId: "updates",
      })),
    ),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { status: "ok" | "error"; details?: { error?: string } }[];
    errors?: { message?: string }[];
  } | null;
  if (!res.ok || !json?.data) throw new Error(json?.errors?.[0]?.message ?? `Expo push ${res.status}`);
  let sent = 0;
  await Promise.all(
    json.data.map(async (ticket, i) => {
      if (ticket.status === "ok") sent++;
      // The app was uninstalled or notifications turned off: forget that device.
      else if (ticket.details?.error === "DeviceNotRegistered") await docs[i]!.ref.delete().catch(() => undefined);
    }),
  );
  return { devices: docs.length, sent };
}
