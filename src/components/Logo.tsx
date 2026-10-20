import Image from "next/image";

/** The ORIGINAL Hey Nanny logo (do not recreate). Intrinsic size 610×507. */
export function Logo({ className = "h-10 w-auto", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/assets/brand/hey-nanny-logo.png" alt="Hey Nanny" width={610} height={507} priority={priority} className={className} />;
}
