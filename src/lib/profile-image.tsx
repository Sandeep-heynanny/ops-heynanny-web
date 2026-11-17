"use client";

import { createRoot } from "react-dom/client";

import {
  CARD_H,
  CARD_W,
  ProfileCard,
  type ProfileData,
} from "@/components/ProfileCard";
import { auth } from "@/lib/firebase";
import { whatsappLink } from "@/lib/format";

/**
 * Makes the customer profile card as an image (one per nanny, in the HeyNanny
 * card design) for sending on WhatsApp: copied to the clipboard to paste into
 * the chat, or downloaded.
 */
export type ProfileItem = {
  nannyId: string;
  data: ProfileData;
  hasPhoto: boolean;
};

/** Fetched through our own server (see /api/nannies/[id]/photo) so it can be drawn into the card. */
async function photoBlobUrl(nannyId: string): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;
  const res = await fetch(`/api/nannies/${encodeURIComponent(nannyId)}/photo`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  return URL.createObjectURL(await res.blob());
}

const nextFrame = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function renderCardJpeg(
  item: ProfileItem,
  demo: boolean,
): Promise<string> {
  const { toJpeg } = await import("html-to-image");
  const photo =
    item.hasPhoto && !demo ? await photoBlobUrl(item.nannyId) : null;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${CARD_W}px`,
    height: `${CARD_H}px`,
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<ProfileCard p={item.data} photoSrc={photo} />);
    await nextFrame();
    await Promise.all(
      [...host.querySelectorAll("img")].map((img) =>
        img.decode().catch(() => undefined),
      ),
    );
    await document.fonts.ready;
    const node = host.firstElementChild as HTMLElement;
    return await toJpeg(node, {
      width: CARD_W,
      height: CARD_H,
      pixelRatio: 2,
      quality: 0.92,
      backgroundColor: "#fcebe1",
      cacheBust: false,
    });
  } finally {
    root.unmount();
    host.remove();
    if (photo) URL.revokeObjectURL(photo);
  }
}

/** One JPEG data URL per nanny. */
export async function buildProfileImages(
  items: ProfileItem[],
  demo = false,
): Promise<string[]> {
  const out: string[] = [];
  for (const item of items) out.push(await renderCardJpeg(item, demo));
  return out;
}

/** All cards stacked into one PNG (the clipboard holds a single image). */
export async function stitchPng(pages: string[]): Promise<Blob> {
  const imgs = await Promise.all(
    pages.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        }),
    ),
  );
  const w = 1086; // 1.2× the card: sharp enough, small enough for WhatsApp
  const h = Math.round((w * imgs[0]!.naturalHeight) / imgs[0]!.naturalWidth);
  const gap = imgs.length > 1 ? 24 : 0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h * imgs.length + gap * (imgs.length - 1);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  imgs.forEach((img, i) => ctx.drawImage(img, 0, i * (h + gap), w, h));
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't make the image");
  return blob;
}

export async function dataUrlToBlob(url: string) {
  return (await fetch(url)).blob();
}

export function profileFileName(name: string) {
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `HeyNanny-${slug || "profile"}.jpg`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Message sent with the profile card. */
export function shareMessage(count: number, customerName: string | null) {
  const first = customerName?.trim().split(/\s+/)[0];
  return `Hi${first ? ` ${first}` : ""}, ${count === 1 ? "here's the nanny profile" : "here are the nanny profiles"} we've picked for you. Please tell us which ${count === 1 ? "one" : "ones"} you'd like to interview.`;
}

/** WhatsApp chat with the customer, or the "send to…" picker when there's no number. */
export function whatsappChatUrl(phone: string | null, text: string) {
  return phone
    ? whatsappLink(phone, text)
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
