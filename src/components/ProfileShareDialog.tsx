"use client";

/* eslint-disable @next/next/no-img-element */
import { Check, Download, Loader2, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildProfileImages,
  dataUrlToBlob,
  downloadBlob,
  profileFileName,
  shareMessage,
  stitchPng,
  whatsappChatUrl,
  type ProfileItem,
} from "@/lib/profile-image";

/** Phones and tablets: WhatsApp is in the share sheet there and takes the image directly. */
const isPhone = () =>
  typeof navigator !== "undefined" &&
  ((navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/**
 * Makes the nanny profile card image(s), previews them, and sends them on
 * WhatsApp: on a computer the card is copied to the clipboard and the chat
 * opens (paste with Cmd/Ctrl+V; a WhatsApp link can't carry a file); on a phone
 * it goes straight to WhatsApp through the share sheet. Or download the image.
 */
export function ProfileShareDialog({
  items,
  customer,
  demo,
  onClose,
}: {
  items: ProfileItem[];
  /** The family it's going to (servicing case). Without one, WhatsApp asks who to send it to. */
  customer: { name: string | null; phone: string | null } | null;
  demo: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [built, setBuilt] = useState<{
    pages: string[];
    png: Blob | null;
    files: File[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<{
    ok: boolean;
    text: string;
    link?: string;
  } | null>(null);
  const text = shareMessage(items.length, customer?.name ?? null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const pages = await buildProfileImages(items, demo);
      const files = await Promise.all(
        pages.map(
          async (src, i) =>
            new File(
              [await dataUrlToBlob(src)],
              profileFileName(items[i]!.data.name),
              { type: "image/jpeg" },
            ),
        ),
      );
      // Ready-made image for the clipboard.
      const png = await stitchPng(pages).catch(() => null);
      if (!off) setBuilt({ pages, png, files });
    })().catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
    // Built once per dialog; the parent remounts it for new profiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    if (!built) return;
    built.files.forEach((f, i) =>
      window.setTimeout(() => downloadBlob(f, f.name), i * 300),
    );
    setNote({
      ok: true,
      text:
        built.files.length === 1
          ? `${built.files[0]!.name} downloaded.`
          : `${built.files.length} images downloaded.`,
    });
  };

  const sendOnWhatsApp = async () => {
    if (!built) return;
    const chat = whatsappChatUrl(customer?.phone ?? null, text);

    // Phone: hand WhatsApp the image(s) through the share sheet.
    if (
      isPhone() &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: built.files })
    ) {
      navigator.clipboard?.writeText(text).catch(() => undefined);
      try {
        await navigator.share({ files: built.files });
        setNote({
          ok: true,
          text: "Sent to the share sheet. The message is copied, paste it in the chat if you want.",
        });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
        // fall through to the clipboard route
      }
    }

    // Computer: copy the card, open the chat with the message typed in, paste.
    const keys = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
    let copied = false;
    if (
      built.png &&
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard?.write
    ) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": built.png }),
        ]);
        copied = true;
      } catch {
        copied = false;
      }
    }
    const win = window.open(chat, "_blank", "noopener,noreferrer");
    if (copied) {
      setNote({
        ok: true,
        text: `Profile card copied${items.length > 1 ? ` (all ${items.length} in one image)` : ""}. In the WhatsApp chat, press ${keys} to paste it, then send.${win ? "" : " Your browser blocked the chat window:"}`,
        link: win ? undefined : chat,
      });
    } else {
      download();
      setNote({
        ok: false,
        text: "Couldn't copy the image, so it was downloaded instead. Drag it into the WhatsApp chat.",
        link: win ? undefined : chat,
      });
    }
  };

  const target = customer?.name || (customer?.phone ? "the customer" : null);

  return (
    <dialog
      ref={ref}
      aria-labelledby="share-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-[480px] rounded-[22px] border border-line bg-paper p-0 text-plum shadow-soft backdrop:bg-plum/40 backdrop:backdrop-blur-[2px] open:animate-[confirm-in_160ms_ease-out]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="share-title" className="truncate text-base font-bold">
            {items.length === 1
              ? `${items[0]!.data.name}'s profile card`
              : `${items.length} profile cards`}
          </h2>
          {target && (
            <p className="truncate text-xs text-muted">For {target}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-white hover:text-plum"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[58vh] overflow-y-auto bg-beige/50 px-5 py-4">
        {failed ? (
          <p className="py-10 text-center text-sm text-red-700">
            Couldn&apos;t make the profile card. Close and try again.
          </p>
        ) : !built ? (
          <div className="grid place-items-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            Making the profile card…
          </div>
        ) : (
          <div className="space-y-3">
            {built.pages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Profile card ${i + 1} of ${built.pages.length}`}
                className="mx-auto w-full max-w-[340px] rounded-xl shadow-soft"
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!built}
            onClick={() => void sendOnWhatsApp()}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#1f9d55] px-3 text-sm font-semibold text-white hover:bg-[#188247] disabled:opacity-40"
          >
            <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
          </button>
          <button
            type="button"
            disabled={!built}
            onClick={download}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk disabled:opacity-40"
          >
            <Download className="size-4" aria-hidden="true" /> Download
          </button>
        </div>
        {note ? (
          <p
            className={`flex items-start gap-1.5 text-xs ${note.ok ? "text-success" : "text-red-700"}`}
            role={note.ok ? "status" : "alert"}
          >
            {note.ok ? (
              <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            <span>
              {note.text}
              {note.link && (
                <>
                  {" "}
                  <a
                    href={note.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline"
                  >
                    Open WhatsApp chat
                  </a>
                </>
              )}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted">
            {isPhone()
              ? "WhatsApp sends the card straight to WhatsApp: pick the chat."
              : `WhatsApp copies the card and opens ${customer?.phone ? "the customer's chat" : "WhatsApp"}; paste it there.`}
          </p>
        )}
      </div>
    </dialog>
  );
}
