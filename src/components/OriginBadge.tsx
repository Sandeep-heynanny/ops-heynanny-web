import { leadOrigin, metaPlatform, ORIGIN_META, type Lead } from "@/lib/types";

/** Small "Google Ads" / "Meta · Instagram" / "Website" badge. */
export function OriginBadge({
  lead,
  className = "",
}: {
  lead: Lead;
  className?: string;
}) {
  const origin = leadOrigin(lead);
  const meta = ORIGIN_META[origin];
  const label =
    origin === "meta" && lead.meta?.platform
      ? `Meta · ${metaPlatform(lead.meta.platform)}`
      : meta.label;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ring-1 ${meta.tone} ${className}`}
    >
      {label}
    </span>
  );
}
