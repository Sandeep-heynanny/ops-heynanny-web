import { Clock } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { staffName, type StaffMember } from "@/lib/staff-list";

/**
 * "Last updated by Sandeep · 18 Nov 2026, 7:46 AM" from a record's own
 * updatedBy / updatedAt, written by every save. Shows nothing until it has both.
 */
export function UpdatedBy({
  by,
  at,
  people,
  label = "Last updated by",
  className = "",
}: {
  by: string | null | undefined;
  at: Date | null | undefined;
  people: StaffMember[];
  label?: string;
  className?: string;
}) {
  if (!by || !at) return null;
  const name = by === "system" ? "System" : staffName(by, people);
  return (
    <p
      className={`inline-flex items-center gap-1 text-xs text-muted ${className}`}
      title={by}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {label} <span className="font-semibold text-plum">{name}</span> ·{" "}
        {formatDateTime(at)}
      </span>
    </p>
  );
}
