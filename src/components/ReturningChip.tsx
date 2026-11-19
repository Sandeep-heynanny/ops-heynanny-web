import { RotateCcw } from "lucide-react";

import { formatDateTime, toDate } from "@/lib/format";
import type { Returning } from "@/lib/leads";
import { leadRef } from "@/lib/types";

/** "Returning" pill: this person converted (paid) on an earlier enquiry. */
export function ReturningChip({
  info,
  onOpen,
  detailed,
}: {
  info: Returning | undefined;
  onOpen?: (id: string) => void;
  detailed?: boolean;
}) {
  if (!info) return null;
  const when =
    toDate(info.previous.ops?.convertedAt) ?? toDate(info.previous.createdAt);
  const label = `Returning customer${info.times > 1 ? ` (${info.times}×)` : ""}`;
  const detail = `Converted before${when ? ` on ${formatDateTime(when).split(",").slice(0, 1).join("")}` : ""} · ${leadRef(info.previous)}`;
  const pill = (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f2f1] px-2 py-0.5 text-[0.7rem] font-semibold text-[#0f6b63]">
      <RotateCcw className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
  if (!detailed)
    return (
      <span className="mt-1" title={detail}>
        {pill}
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {pill}
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(info.previous.id)}
          className="text-xs font-semibold text-[#0f6b63] underline-offset-2 hover:underline"
        >
          {detail}
        </button>
      ) : (
        <span className="text-xs text-muted">{detail}</span>
      )}
    </span>
  );
}
