"use client";

/**
 * Sound and desktop alerts for new work (Sandeep, 2026-11-20): new enquiries
 * for sales, new customers from sales for servicing. The sound can be muted
 * per computer (localStorage). Browsers only play sound after the person has
 * clicked or typed on the page once, and only show desktop notifications after
 * they allow them (header button).
 */
import { useEffect, useState } from "react";

const MUTE_KEY = "hn-ops-sound-muted";
const EVENT = "hn-ops-alerts";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

// Browsers keep audio locked until a click or key press; unlock on the first one.
if (typeof window !== "undefined") {
  const unlock = () => {
    void audio()?.resume().catch(() => undefined);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode: stays as it is for this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Two soft notes (no sound file needed). */
export function playChime() {
  if (isMuted()) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime;
  [
    [880, 0],
    [1320, 0.16],
  ].forEach(([freq, at]) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, t + at!);
    gain.gain.exponentialRampToValueAtTime(0.25, t + at! + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at! + 0.45);
    osc.connect(gain).connect(a.destination);
    osc.start(t + at!);
    osc.stop(t + at! + 0.5);
  });
}

export type DesktopPermission = NotificationPermission | "unsupported";

export function desktopPermission(): DesktopPermission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export async function askDesktopPermission(): Promise<DesktopPermission> {
  if (desktopPermission() === "unsupported") return "unsupported";
  const p = await Notification.requestPermission();
  window.dispatchEvent(new Event(EVENT));
  return p;
}

/** A system pop-up, only when the dashboard isn't the tab in front (the on-page toast covers that). */
export function desktopNotify(title: string, body: string, onClick?: () => void) {
  if (desktopPermission() !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(title, { body, icon: "/icon.png", tag: `${title}:${body}` });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Sound + desktop pop-up together. */
export function alertNew(title: string, body: string, onClick?: () => void) {
  playChime();
  desktopNotify(title, body, onClick);
}

/** Mute + desktop permission state for the header controls. */
export function useAlertSettings() {
  const [state, setState] = useState<{ muted: boolean; permission: DesktopPermission }>({
    muted: false,
    permission: "unsupported",
  });
  useEffect(() => {
    const read = () => setState({ muted: isMuted(), permission: desktopPermission() });
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return state;
}
