"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import type { Staff } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import {
  canSeeEnquiries,
  canSeeNannies,
  canSeePayments,
  canSeeServicing,
} from "@/lib/firebase";

export type Section = "enquiries" | "servicing" | "nannies" | "payments";

/** Top bar shared by every page. "Payments" only appears for admins. */
export function AppHeader({
  staff,
  active,
}: {
  staff: Staff;
  active: Section;
}) {
  const { signOut } = useAuth();
  const links: { id: Section; href: string; label: string }[] = [
    ...(canSeeEnquiries(staff.role)
      ? [{ id: "enquiries" as const, href: "/", label: "Enquiries" }]
      : []),
    ...(canSeeServicing(staff.role)
      ? [{ id: "servicing" as const, href: "/servicing", label: "Servicing" }]
      : []),
    ...(canSeeNannies(staff.role)
      ? [{ id: "nannies" as const, href: "/nannies", label: "Nannies" }]
      : []),
    ...(canSeePayments(staff.role)
      ? [{ id: "payments" as const, href: "/payments", label: "Payments" }]
      : []),
  ];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-milk/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href={links[0]?.href ?? "/"} aria-label="Home">
          <Logo className="h-10 w-auto" priority />
        </Link>
        <span className="rounded-full bg-plum px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-milk">
          Ops
        </span>
        {links.length > 0 && (
          <nav aria-label="Sections" className="ml-2 flex gap-1">
            {links.map((l) => (
              <Link
                key={l.id}
                href={l.href}
                aria-current={active === l.id ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  active === l.id
                    ? "bg-plum/10 text-plum"
                    : "text-muted hover:bg-plum/5 hover:text-plum"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight text-plum">
              {staff.name}
            </p>
            <p className="text-xs leading-tight text-muted">
              {staff.email} · {staff.role}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
