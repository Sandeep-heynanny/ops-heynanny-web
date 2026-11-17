import { STATUS_META, type LeadStatus } from "@/lib/types";

export function StatusPill({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
