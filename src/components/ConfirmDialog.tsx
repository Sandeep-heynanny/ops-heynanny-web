"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * In-app replacement for window.confirm. Mount <ConfirmHost /> once (root
 * layout), then anywhere:
 *
 *   if (!(await confirmDialog({ title: "Undo placement?", confirmLabel: "Undo", danger: true }))) return;
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for anything that removes or undoes work. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const p = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p && !d.open) {
      d.showModal();
      // Destructive actions start on Cancel, so Enter doesn't do damage by accident.
      if (!p.danger) confirmRef.current?.focus();
    } else if (!p && d.open) d.close();
  }, [p]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        settle(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
      onClick={(e) => e.target === ref.current && settle(false)}
      className="m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[22px] border border-line bg-paper p-0 text-plum shadow-soft backdrop:bg-plum/40 backdrop:backdrop-blur-[2px] open:animate-[confirm-in_160ms_ease-out]"
    >
      {p && (
        <div className="p-5">
          <div className="flex items-start gap-3">
            {p.danger && (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-700">
                <AlertTriangle className="size-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              <h2
                id="confirm-title"
                className="text-base font-bold leading-snug"
              >
                {p.title}
              </h2>
              {p.message && (
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {p.message}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => settle(false)}
              className="h-10 rounded-full bg-white px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk"
            >
              {p.cancelLabel ?? "Cancel"}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => settle(true)}
              className={`h-10 rounded-full px-4 text-sm font-semibold text-white ${p.danger ? "bg-red-700 hover:bg-red-800" : "bg-plum hover:bg-plum-soft"}`}
            >
              {p.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
