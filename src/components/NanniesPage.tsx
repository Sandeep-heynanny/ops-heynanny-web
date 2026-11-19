"use client";

import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  Download,
  Eye,
  FileLock2,
  FileText,
  Loader2,
  Plus,
  Search,
  MessageCircle,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  CopyX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { confirmDialog } from "@/components/ConfirmDialog";
import { UpdatedBy } from "@/components/UpdatedBy";
import { staffName, useStaffList, type StaffMember } from "@/lib/staff-list";
import { LanguagePicker } from "@/components/LanguagePicker";
import { PlacePicker } from "@/components/PlacePicker";
import { NannyAvatar } from "@/components/NannyAvatar";
import { profileData } from "@/components/ProfileCard";
import { ProfileShareDialog } from "@/components/ProfileShareDialog";
import type { Staff } from "@/lib/auth";
import { downloadRows } from "@/lib/csv";
import { parseCsv } from "@/lib/csv-parse";
import {
  guessColumns,
  planImport,
  TARGETS,
  type ColumnMap,
} from "@/lib/nanny-import";
import { canExportNannies, canImportNannies } from "@/lib/firebase";
import { formatDateTime, localISODate } from "@/lib/format";
import { validGeo, type GeoPlace } from "@/lib/geo";
import { displayPhone } from "@/lib/types";
import {
  checkDocument,
  DOC_KINDS,
  deleteNanny,
  deleteNannyPhoto,
  documentUrl,
  importNannies,
  removeNannyDocument,
  uploadNannyDocument,
  type DocKind,
  NANNY_STATUS_META,
  nannyPlace,
  newNannyId,
  preparePhoto,
  saveNanny,
  uploadNannyPhoto,
  useNannies,
  WORK_TYPE_LABEL,
  type Nanny,
  type NannyInput,
  type NannyStatus,
  type WorkType,
} from "@/lib/nannies";

/** Same categories as the nanny sheet. Picking one fills in the work type if it's not set. */
const ROLES: { label: string; workType: WorkType | null }[] = [
  { label: "Day Nanny", workType: "day" },
  { label: "Live-In Nanny", workType: "live_in" },
  { label: "Japa Nanny", workType: "live_in" },
  { label: "Elderly Care", workType: null },
  { label: "Housekeeping", workType: null },
];

/** Servicing team + admins: the caregiver database. Export and import are admin-only. */
export function NanniesPage({ staff, demo }: { staff: Staff; demo?: Nanny[] }) {
  const { nannies, loading, error } = useNannies(true, demo);
  const people = useStaffList(!!demo);
  const isAdmin = canExportNannies(staff.role);
  const canImport = canImportNannies(staff.role);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | NannyStatus>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [language, setLanguage] = useState("all");
  const [city, setCity] = useState("all");
  // Which nanny the drawer is showing. The drawer reads her live record, so it
  // stays up to date after saves (new photo, etc.); `key` keeps it mounted
  // when a new nanny gets her ID on first save.
  const [editing, setEditing] = useState<{
    key: string;
    id: string | null;
  } | null>(null);
  const editingNanny = editing?.id
    ? (nannies.find((n) => n.id === editing.id) ?? null)
    : null;
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    document.title = "Nannies · HeyNanny Ops";
  }, []);

  const languages = useMemo(
    () =>
      [
        ...new Set(
          nannies.flatMap((n) =>
            n.languages.map((l) => l.replace(/ \(basic\)$/, "")),
          ),
        ),
      ].sort(),
    [nannies],
  );
  // The standard roles first, then any other role already on a nanny.
  const roleOptions = useMemo(() => {
    const extra = [
      ...new Set(nannies.map((n) => n.role).filter((r): r is string => !!r)),
    ]
      .filter((r) => !ROLES.some((x) => x.label === r))
      .sort();
    return [...ROLES.map((r) => r.label), ...extra];
  }, [nannies]);
  const cities = useMemo(
    () =>
      [
        ...new Set(nannies.map((n) => n.city).filter((c): c is string => !!c)),
      ].sort(),
    [nannies],
  );
  // Nannies sharing a phone number with someone else: added twice by mistake.
  const dupIds = useMemo(() => {
    const byPhone = new Map<string, string[]>();
    for (const n of nannies) {
      const p = phoneKey(n.phone);
      if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), n.id]);
    }
    return new Set(
      [...byPhone.values()].filter((ids) => ids.length > 1).flat(),
    );
  }, [nannies]);
  const [dupsOnly, setDupsOnly] = useState(false);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: nannies.length };
    for (const n of nannies) c[n.status] = (c[n.status] ?? 0) + 1;
    return c;
  }, [nannies]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return nannies.filter(
      (n) =>
        (!dupsOnly || dupIds.has(n.id)) &&
        (status === "all" || n.status === status) &&
        (roleFilter === "all" ||
          (roleFilter === "none" ? !n.role : n.role === roleFilter)) &&
        (language === "all" ||
          n.languages.some(
            (l) => l === language || l === `${language} (basic)`,
          )) &&
        (city === "all" || n.city === city) &&
        (!q ||
          n.name.toLowerCase().includes(q) ||
          (n.area ?? "").toLowerCase().includes(q) ||
          (n.city ?? "").toLowerCase().includes(q) ||
          (n.role ?? "").toLowerCase().includes(q) ||
          n.languages.some((l) => l.toLowerCase().includes(q)) ||
          (digits.length >= 3 &&
            ((n.phone ?? "").includes(digits) ||
              (n.altPhone ?? "").includes(digits)))),
    );
  }, [nannies, search, status, roleFilter, language, city, dupsOnly, dupIds]);

  const exportCsv = () =>
    downloadRows(
      rows,
      [
        ["Name", (n) => n.name],
        ["Phone", (n) => n.phone ?? ""],
        ["Alternate phone", (n) => n.altPhone ?? ""],
        ["Role", (n) => n.role ?? ""],
        ["Age", (n) => n.age ?? ""],
        ["Experience (years)", (n) => n.experienceYears ?? ""],
        ["Languages", (n) => n.languages.join(", ")],
        ["Work type", (n) => (n.workType ? WORK_TYPE_LABEL[n.workType] : "")],
        ["Area", (n) => n.area ?? ""],
        ["City", (n) => n.city ?? ""],
        ["Skills", (n) => n.skills.join(", ")],
        ["Status", (n) => NANNY_STATUS_META[n.status].label],
        ["Placed with", (n) => n.placement?.customerName ?? ""],
        ["Photo URL", (n) => n.photoUrl ?? ""],
      ],
      `heynanny-nannies-${localISODate(new Date())}.csv`,
    );

  return (
    <div className="min-h-dvh">
      <AppHeader staff={staff} active="nannies" />
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.9rem] leading-tight text-plum">
              Nannies
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Caregiver profiles for matching. Confidential: for the servicing
              and supply teams only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canImport && (
              <ToolbarButton
                onClick={() => setImporting(true)}
                icon={<Upload className="size-4" aria-hidden="true" />}
              >
                Import CSV
              </ToolbarButton>
            )}
            {isAdmin && (
              <>
                <ToolbarButton
                  onClick={exportCsv}
                  disabled={!rows.length}
                  icon={<Download className="size-4" aria-hidden="true" />}
                >
                  Export {rows.length || ""}
                </ToolbarButton>
              </>
            )}
            <button
              type="button"
              onClick={() => setEditing({ key: `new-${Date.now()}`, id: null })}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-plum px-4 text-sm font-semibold text-milk hover:bg-plum-soft"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add nanny
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <section
          aria-label="Filters"
          className="mt-5 rounded-[20px] border border-line bg-paper p-3 shadow-soft"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search</span>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, area, language, phone"
                className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm text-plum placeholder:text-muted/80 focus:border-plum focus:outline-none"
              />
            </label>
            <Pick
              label="Role"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                ["all", "All roles"],
                ...roleOptions.map((r) => [r, r] as [string, string]),
                ["none", "Role not set"],
              ]}
            />
            {cities.length > 1 && (
              <Pick
                label="City"
                value={city}
                onChange={setCity}
                options={[
                  ["all", "All cities"],
                  ...cities.map((c) => [c, c] as [string, string]),
                ]}
              />
            )}
            <Pick
              label="Language"
              value={language}
              onChange={setLanguage}
              options={[
                ["all", "All languages"],
                ...languages.map((l) => [l, l] as [string, string]),
              ]}
            />
            {(dupIds.size > 0 || dupsOnly) && (
              <button
                type="button"
                aria-pressed={dupsOnly}
                onClick={() => setDupsOnly((d) => !d)}
                title="Nannies added more than once (same phone number)"
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ${dupsOnly ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-white text-amber-800 ring-line hover:bg-amber-50"}`}
              >
                <CopyX className="size-4" aria-hidden="true" />
                {dupsOnly ? "Showing duplicates" : "Duplicates"} ({dupIds.size})
              </button>
            )}
          </div>
          <div
            role="tablist"
            aria-label="Status"
            className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3"
          >
            {(
              [
                "all",
                "available",
                "interviewing",
                "placed",
                "on_leave",
                "inactive",
              ] as const
            ).map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${status === s ? "bg-plum text-milk" : "text-plum hover:bg-plum/5"}`}
              >
                {s === "all" ? "All" : NANNY_STATUS_META[s].label}
                <span
                  className={`min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${status === s ? "bg-milk/20 text-milk" : "bg-beige text-muted"}`}
                >
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <Empty>Loading nannies…</Empty>
        ) : !rows.length ? (
          <Empty>
            {nannies.length
              ? "No nannies match these filters."
              : "No nannies yet. Add one, or ask an admin to import the list."}
          </Empty>
        ) : (
          <NanniesTable
            rows={rows}
            people={people}
            onOpen={(n) => setEditing({ key: n.id, id: n.id })}
          />
        )}
      </main>

      {editing && (!editing.id || editingNanny) && (
        <NannyForm
          key={editing.key}
          nanny={editingNanny}
          people={people}
          others={nannies}
          onOpen={(id) => setEditing({ key: id, id })}
          staff={staff}
          demo={!!demo}
          onSaved={(id) => !demo && setEditing((e) => (e ? { ...e, id } : e))}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && canImport && (
        <ImportPanel
          staff={staff}
          demo={!!demo}
          existing={nannies}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

/* ---------------- table ---------------- */

type SortKey =
  "name" | "age" | "experienceYears" | "area" | "status" | "updated";

function NanniesTable({
  rows,
  people,
  onOpen,
}: {
  rows: Nanny[];
  people: StaffMember[];
  onOpen: (n: Nanny) => void;
}) {
  const [sort, setSort] = useState<SortState>({ key: "name", dir: 1 });
  const sorted = useMemo(() => {
    const val = (n: Nanny): string | number => {
      switch (sort.key) {
        case "age":
          return n.age ?? -1;
        case "experienceYears":
          return n.experienceYears ?? -1;
        case "area":
          return (nannyPlace(n) ?? "").toLowerCase();
        case "status":
          return n.status;
        case "updated":
          return n.updatedAt?.toMillis?.() ?? 0;
        default:
          return n.name.toLowerCase();
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (
        (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.name.localeCompare(b.name)
      );
    });
  }, [rows, sort]);

  const th = { sort, setSort };
  return (
    <div className="mt-4 overflow-x-auto rounded-[20px] border border-line bg-paper">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <Th {...th} k="name">
              Name
            </Th>
            <Th {...th}>Role</Th>
            <Th {...th} k="age" className="text-right">
              Age
            </Th>
            <Th {...th} k="experienceYears" className="text-right">
              Exp
            </Th>
            <Th {...th}>Languages</Th>
            <Th {...th}>Work</Th>
            <Th {...th} k="area">
              Area
            </Th>
            <Th {...th} k="updated">
              Last updated
            </Th>
            <Th {...th} k="status">
              Status
            </Th>
            <th className="w-8" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((n) => (
            <tr
              key={n.id}
              onClick={() => onOpen(n)}
              className="cursor-pointer align-middle transition-colors hover:bg-white"
            >
              <td className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), onOpen(n))}
                  className="flex items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-plum"
                >
                  <NannyAvatar name={n.name} photoUrl={n.photoUrl} size={34} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-plum">
                      {n.name}
                    </span>
                    <span className="block text-xs tabular-nums text-muted">
                      {n.phone ? displayPhone(n.phone) : "No phone"}
                    </span>
                  </span>
                </button>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-plum">
                {n.role ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-plum">
                {n.age ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-plum">
                {n.experienceYears === null
                  ? "—"
                  : n.experienceYears === 0
                    ? "Fresher"
                    : `${n.experienceYears} yrs`}
              </td>
              <td className="max-w-[220px] px-4 py-2.5 text-xs text-plum">
                {n.languages.join(", ") || "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-plum">
                {n.workType ? WORK_TYPE_LABEL[n.workType] : "—"}
              </td>
              <td className="max-w-[200px] px-4 py-2.5 text-plum">
                <span className="block truncate">{n.area ?? "—"}</span>
                {n.city && n.city !== n.area && (
                  <span className="block text-xs text-muted">{n.city}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                {n.updatedAt?.toDate ? (
                  <span title={n.updatedBy ?? undefined}>
                    <span className="block text-plum">
                      {formatDateTime(n.updatedAt.toDate())}
                    </span>
                    <span className="block text-muted">
                      {n.updatedBy ? staffName(n.updatedBy, people) : "—"}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${NANNY_STATUS_META[n.status].tone}`}
                >
                  {NANNY_STATUS_META[n.status].label}
                </span>
                {n.status === "placed" && n.placement?.customerName && (
                  <span className="mt-0.5 block max-w-[140px] truncate text-xs text-muted">
                    With {n.placement.customerName}
                  </span>
                )}
              </td>
              <td className="px-2 py-2.5 text-muted">
                <ChevronRight className="size-4" aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortState = { key: SortKey; dir: 1 | -1 };

function Th({
  k,
  children,
  className = "",
  sort,
  setSort,
}: {
  k?: SortKey;
  children: ReactNode;
  className?: string;
  sort: SortState;
  setSort: (fn: (s: SortState) => SortState) => void;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 font-semibold ${className}`}
      aria-sort={
        k && sort.key === k
          ? sort.dir === 1
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      {k ? (
        <button
          type="button"
          onClick={() =>
            setSort((s) =>
              s.key === k
                ? { key: k, dir: s.dir === 1 ? -1 : 1 }
                : { key: k, dir: k === "experienceYears" ? -1 : 1 },
            )
          }
          className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-plum"
        >
          {children}
          {sort.key === k &&
            (sort.dir === 1 ? (
              <ArrowUp className="size-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3" aria-hidden="true" />
            ))}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/* ---------------- add / edit ---------------- */

const emptyInput: NannyInput = {
  name: "",
  phone: null,
  altPhone: null,
  photoUrl: null,
  age: null,
  role: "Day Nanny",
  experienceYears: null,
  languages: [],
  workType: "day",
  area: null,
  city: "Bengaluru",
  skills: [],
  status: "available",
  placement: null,
  notes: "",
};

function NannyForm({
  nanny,
  people,
  others,
  onOpen,
  staff,
  demo,
  onSaved,
  onClose,
}: {
  nanny: Nanny | null;
  /** Everyone on staff, for "Last updated by". */
  people: StaffMember[];
  /** Every nanny, to catch the same phone number being added twice. */
  others: Nanny[];
  onOpen: (id: string) => void;
  staff: Staff;
  demo: boolean;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(() => {
    const n = nanny ?? { ...emptyInput, id: "" };
    return {
      name: n.name,
      phone: n.phone ?? "",
      altPhone: n.altPhone ?? "",
      age: n.age?.toString() ?? "",
      role: n.role ?? "",
      experienceYears: n.experienceYears?.toString() ?? "",
      languages: n.languages.join(", "),
      workType: (n.workType ?? "") as WorkType | "",
      area: n.area ?? "",
      city: n.city ?? "",
      nativePlace: n.nativePlace ?? "",
      verified: n.verified !== false,
      skills: n.skills.join(", "),
      status: n.status,
      notes: n.notes ?? "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // New nannies get their ID up front so the photo can be stored under it.
  const [id] = useState(
    () => nanny?.id ?? (demo ? `demo-${Date.now()}` : newNannyId()),
  );
  // Photo: what's saved, a newly picked one waiting for Save, or removed.
  const [pending, setPending] = useState<{
    blob: Blob;
    preview: string;
  } | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // Map location (Google Maps picker), saved with the form.
  const [loc, setLoc] = useState<{ address: string; geo: GeoPlace | null }>({
    address: nanny?.address ?? "",
    geo: nanny?.geo ?? null,
  });
  // Saved at least once (an existing nanny, or a new one after "Add nanny").
  const [exists, setExists] = useState(!!nanny);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(
    () => () => (pending ? URL.revokeObjectURL(pending.preview) : undefined),
    [pending],
  );
  const shownPhoto =
    pending?.preview ?? (photoRemoved ? null : (nanny?.photoUrl ?? null));
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const blob = await preparePhoto(file);
      setPending({ blob, preview: URL.createObjectURL(blob) });
      setPhotoRemoved(false);
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const list = (v: string) => [
    ...new Set(
      v
        .split(/[,;/]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  const numOrNull = (v: string) =>
    v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
  const phoneDigits = f.phone.replace(/\D/g, "").slice(-10);
  const phoneBad = !!f.phone.trim() && !/^[6-9]\d{9}$/.test(phoneDigits);
  // Same phone as another nanny: she's probably already in the list. Blocks a
  // new nanny, or changing the number to one that's taken; an existing
  // duplicate can still be saved so it can be fixed.
  const samePhone = phoneBad
    ? []
    : others.filter(
        (o) =>
          o.id !== id &&
          (phoneKey(o.phone) === phoneDigits ||
            phoneKey(o.altPhone) === phoneDigits),
      );
  const phoneTaken =
    samePhone.length > 0 && (!exists || phoneKey(nanny?.phone) !== phoneDigits);
  // Everything is required except role, skills, documents, alternate phone and notes.
  const [tried, setTried] = useState(false);
  const missing: Record<string, boolean> = {
    "Full name": !f.name.trim(),
    Photo: !shownPhoto,
    Phone: !f.phone.trim() || phoneBad,
    Age: numOrNull(f.age) === null || Number(f.age) < 18 || Number(f.age) > 75,
    Experience: numOrNull(f.experienceYears) === null,
    "Work type": !f.workType,
    Location: !loc.address.trim(),
    "Area / locality": !f.area.trim(),
    City: !f.city.trim(),
    "Native place": !f.nativePlace.trim(),
    Languages: list(f.languages).length === 0,
  };
  const missingList = Object.keys(missing).filter((k) => missing[k]);
  const bad = (k: string) => tried && missing[k];
  const altDigits = f.altPhone.replace(/\D/g, "").slice(-10);
  const altBad = !!f.altPhone.trim() && !/^[6-9]\d{9}$/.test(altDigits);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setTried(true);
    if (missingList.length || altBad || phoneTaken) return;
    setSaving(true);
    setError(null);
    try {
      let photo = {
        url: nanny?.photoUrl ?? null,
        path: nanny?.photoPath ?? null,
      };
      const oldPath = photo.path;
      if (pending && !demo) photo = await uploadNannyPhoto(id, pending.blob);
      else if (photoRemoved) photo = { url: null, path: null };
      const input: NannyInput = {
        name: f.name.trim(),
        phone: f.phone.trim() ? phoneDigits : null,
        altPhone: f.altPhone.trim() ? altDigits : null,
        photoUrl: photo.url,
        photoPath: photo.path,
        age: numOrNull(f.age),
        role: f.role.trim() || null,
        experienceYears: numOrNull(f.experienceYears),
        languages: list(f.languages),
        workType: f.workType || null,
        area: f.area.trim() || null,
        city: f.city.trim() || null,
        nativePlace: f.nativePlace.trim() || null,
        address: loc.address.trim() || null,
        geo: loc.geo && validGeo(loc.geo) ? loc.geo : null,
        verified: f.verified,
        skills: list(f.skills),
        status: f.status,
        notes: f.notes,
        // Placement is managed from the servicing case.
        placement: nanny?.placement ?? null,
      };
      if (!demo) {
        await saveNanny(id, input, staff.email, !exists);
        if (oldPath && oldPath !== photo.path) await deleteNannyPhoto(oldPath);
      }
      // Stay open: the drawer now shows the saved record (and new photo).
      setExists(true);
      setPending(null);
      setPhotoRemoved(false);
      setSaving(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
      onSaved(id);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "permission-denied" || code === "storage/unauthorized"
          ? "You don't have permission to edit nannies or upload photos."
          : code.startsWith("storage/")
            ? "Couldn't upload the photo. Check your connection and try again."
            : "Couldn't save. Check your connection.",
      );
      setSaving(false);
    }
  };

  const input =
    "mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none";

  return (
    <SidePanel title={nanny ? nanny.name : "Add nanny"} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex items-center gap-4">
          <NannyAvatar name={f.name || "?"} photoUrl={shownPhoto} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk ${photoBusy ? "pointer-events-none opacity-60" : ""}`}
              >
                {photoBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="size-4" aria-hidden="true" />
                )}
                {shownPhoto ? "Change photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {shownPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setPhotoRemoved(true);
                  }}
                  className="h-9 rounded-full px-3 text-sm font-semibold text-muted hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {pending
                ? "New photo, saved when you press Save."
                : "JPG, PNG or WebP, 5 MB or less."}
            </p>
            {photoError && (
              <p className="mt-1 text-xs text-red-700">{photoError}</p>
            )}
            {bad("Photo") && !photoError && (
              <p className="mt-1 text-xs text-red-700">Add her photo.</p>
            )}
          </div>
        </div>
        <Field label="Full name *">
          <input
            value={f.name}
            onChange={set("name")}
            className={`${input} ${bad("Full name") ? "border-red-400" : ""}`}
            autoFocus={!nanny}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone *">
            <input
              value={f.phone}
              onChange={set("phone")}
              inputMode="tel"
              placeholder="98765 43210"
              className={`${input} ${phoneBad || bad("Phone") || phoneTaken ? "border-red-400" : ""}`}
            />
          </Field>
          <Field label="Alternate phone">
            <input
              value={f.altPhone}
              onChange={set("altPhone")}
              inputMode="tel"
              className={`${input} ${altBad ? "border-red-400" : ""}`}
            />
          </Field>
          <Field label="Role">
            <select
              value={f.role}
              onChange={(e) => {
                const role = e.target.value;
                const wt = ROLES.find((r) => r.label === role)?.workType;
                setF((x) => ({ ...x, role, workType: x.workType || wt || "" }));
              }}
              className={input}
            >
              <option value="">Not set</option>
              {ROLES.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
              {/* Keep an older or imported value that isn't in the list. */}
              {f.role && !ROLES.some((r) => r.label === f.role) && (
                <option value={f.role}>{f.role}</option>
              )}
            </select>
          </Field>
          <Field label="Age *">
            <input
              value={f.age}
              onChange={set("age")}
              inputMode="numeric"
              className={`${input} ${bad("Age") ? "border-red-400" : ""}`}
            />
          </Field>
          <Field label="Experience (years) *">
            <input
              value={f.experienceYears}
              onChange={set("experienceYears")}
              inputMode="decimal"
              className={`${input} ${bad("Experience") ? "border-red-400" : ""}`}
            />
          </Field>
          <Field label="Work type *">
            <select
              value={f.workType}
              onChange={set("workType")}
              className={`${input} ${bad("Work type") ? "border-red-400" : ""}`}
            >
              <option value="">Not set</option>
              <option value="live_in">Live-in</option>
              <option value="day">Day</option>
              <option value="both">Live-in or day</option>
            </select>
          </Field>
          <Field label="Status *">
            <select value={f.status} onChange={set("status")} className={input}>
              {(Object.keys(NANNY_STATUS_META) as NannyStatus[]).map((s) => (
                <option key={s} value={s}>
                  {NANNY_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {samePhone.length > 0 && (
          <div
            role="alert"
            className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${phoneTaken ? "bg-red-50 text-red-800 ring-red-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}
          >
            <p className="font-semibold">
              {phoneTaken
                ? "This number is already on another nanny."
                : "Another nanny has this number: she may be a duplicate."}
            </p>
            <ul className="mt-1 space-y-1">
              {samePhone.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {o.name}
                    {o.createdBy
                      ? ` · added by ${staffName(o.createdBy, people)}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(o.id)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Open her
                  </button>
                </li>
              ))}
            </ul>
            {!phoneTaken && (
              <p className="mt-1 text-xs">
                Keep one record and ask an admin to delete the other.
              </p>
            )}
          </div>
        )}
        <div className="block text-xs font-semibold text-muted">
          Location (for matching) *
          <PlacePicker
            address={loc.address}
            geo={loc.geo}
            placeholder="Search where she lives or works from"
            onChange={({ address, geo }) => {
              setLoc({ address, geo });
              // Fill area / city from the map when picked.
              if (geo)
                setF((x) => ({
                  ...x,
                  area: geo.area ?? x.area,
                  city: geo.city ?? x.city,
                }));
            }}
          />
          {bad("Location") ? (
            <span className="mt-1 block font-normal text-red-700">
              Pick where she lives or works from.
            </span>
          ) : (
            !loc.geo && (
              <span className="mt-1 block font-normal text-muted">
                Used to suggest her to families nearby.
              </span>
            )
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area / locality *">
            <input
              value={f.area}
              onChange={set("area")}
              placeholder="e.g. KR Puram"
              className={`${input} ${bad("Area / locality") ? "border-red-400" : ""}`}
            />
          </Field>
          <Field label="City *">
            <input
              value={f.city}
              onChange={set("city")}
              list="nanny-cities"
              className={`${input} ${bad("City") ? "border-red-400" : ""}`}
            />
            <datalist id="nanny-cities">
              {["Bengaluru", "Mumbai", "Delhi"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Native place (state / town) *">
            <input
              value={f.nativePlace}
              onChange={set("nativePlace")}
              placeholder="e.g. Madhya Pradesh"
              className={`${input} ${bad("Native place") ? "border-red-400" : ""}`}
            />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-sm text-plum ring-1 ring-line">
          <input
            type="checkbox"
            checked={f.verified}
            onChange={(e) =>
              setF((x) => ({ ...x, verified: e.target.checked }))
            }
            className="mt-0.5 size-4 accent-plum"
          />
          <span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <ShieldCheck className="size-4" aria-hidden="true" /> Verified by
              HeyNanny
            </span>
            <span className="block text-xs text-muted">
              Shows the &ldquo;Verified · Trusted&rdquo; badge on her profile
              card. On by default; untick to hide it.
            </span>
          </span>
        </label>
        {/* Not a <label>: it would forward clicks inside the dropdown to its button. */}
        <div className="block text-xs font-semibold text-muted">
          Languages *
          <LanguagePicker
            value={list(f.languages)}
            onChange={(next) =>
              setF((x) => ({ ...x, languages: next.join(", ") }))
            }
            invalid={!!bad("Languages")}
          />
        </div>
        <Field label="Skills (comma separated)">
          <input
            value={f.skills}
            onChange={set("skills")}
            placeholder="Newborn care, Cooking, First aid"
            className={input}
          />
        </Field>
        <DocumentsBox nanny={nanny} staff={staff} demo={demo} />
        <Field label="Internal notes (never shown to customers)">
          <textarea
            value={f.notes}
            onChange={set("notes")}
            rows={4}
            maxLength={5000}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-plum focus:border-plum focus:outline-none"
          />
        </Field>
        {nanny?.status === "placed" && nanny.placement && (
          <p className="rounded-xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-line">
            Placed with {nanny.placement.customerName ?? "a customer"}
            {nanny.placement.since ? ` since ${nanny.placement.since}` : ""}.
            Change this from the servicing case.
          </p>
        )}
        {tried && missingList.length > 0 && (
          <p className="text-sm text-red-700" role="alert">
            Fill in: {missingList.join(", ")}.
          </p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {nanny && (
          <div className="flex flex-col gap-1">
            <UpdatedBy
              by={nanny.createdBy}
              at={nanny.createdAt?.toDate?.() ?? null}
              people={people}
              label="Created by"
            />
            <UpdatedBy
              by={nanny.updatedBy}
              at={nanny.updatedAt?.toDate?.() ?? null}
              people={people}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-4">
        {confirmDelete ? (
          <>
            <p className="flex-1 text-sm text-plum">
              Delete {nanny?.name}? This can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={async () => {
                if (nanny && !demo)
                  await deleteNanny(nanny).catch(() =>
                    setError("Couldn't delete."),
                  );
                onClose();
              }}
              className="h-11 rounded-full bg-red-600 px-5 text-sm font-semibold text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-11 rounded-full px-4 text-sm font-semibold text-plum"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving || photoBusy}
              className="h-11 flex-1 rounded-full bg-plum px-5 text-sm font-semibold text-milk hover:bg-plum-soft disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : savedFlash
                  ? "Saved ✓"
                  : exists
                    ? "Save changes"
                    : "Add nanny"}
            </button>
            {nanny && (
              <button
                type="button"
                onClick={() => setSharing(true)}
                disabled={!!pending || photoRemoved || saving}
                title={
                  pending || photoRemoved
                    ? "Save the photo change first"
                    : "Her profile card for WhatsApp (saved details)"
                }
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk disabled:opacity-50"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Profile card
              </button>
            )}
            {nanny && staff.role === "admin" && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete nanny"
                className="grid size-11 place-items-center rounded-full text-red-600 hover:bg-red-50"
              >
                <Trash2 className="size-5" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
      {sharing && nanny && (
        <ProfileShareDialog
          items={[
            {
              nannyId: nanny.id,
              data: profileData(nanny),
              hasPhoto: !!nanny.photoUrl,
            },
          ]}
          customer={null}
          demo={demo}
          onClose={() => setSharing(false)}
        />
      )}
    </SidePanel>
  );
}

/* ---------------- CSV import (admins) ---------------- */

function ImportPanel({
  staff,
  demo,
  existing,
  onClose,
}: {
  staff: Staff;
  demo: boolean;
  existing: Nanny[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ColumnMap>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const header = rows?.[0] ?? [];
  const body = useMemo(() => rows?.slice(1) ?? [], [rows]);
  const existingPhones = useMemo(
    () =>
      new Set(
        existing
          .flatMap((n) => [n.phone, n.altPhone])
          .filter((p): p is string => !!p),
      ),
    [existing],
  );

  const onFile = async (file: File) => {
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setRows(parsed);
    setMap(guessColumns(parsed[0] ?? []));
    setMsg(null);
  };

  const plan = useMemo(
    () => planImport(body, map, existingPhones),
    [body, map, existingPhones],
  );

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!demo) await importNannies(plan.rows, staff.email);
      setMsg(`Imported ${plan.rows.length} nannies.`);
      setRows(null);
    } catch (e) {
      setMsg(
        (e as { code?: string }).code === "permission-denied"
          ? "No permission to import."
          : `Import failed: ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel title="Import nannies (CSV)" onClose={onClose} wide>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-sm text-muted">
          Export your sheet as CSV (Google Sheets: File → Download → CSV), then
          choose it here. Check the column matches and the preview, then import.
          Nannies whose phone number is already in the list are skipped, so
          importing the same file twice won&apos;t create duplicates.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk"
        >
          <Upload className="size-4" aria-hidden="true" />
          {fileName || "Choose CSV file"}
        </button>

        {rows && (
          <>
            <section className="rounded-[18px] border border-line bg-paper p-4">
              <p className="text-sm font-bold text-plum">Match columns</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {TARGETS.map((t) => (
                  <label
                    key={t.key}
                    className="text-xs font-semibold text-muted"
                  >
                    {t.label}
                    <select
                      value={map[t.key] ?? ""}
                      onChange={(e) =>
                        setMap((m) => ({
                          ...m,
                          [t.key]:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm font-normal text-plum"
                    >
                      <option value="">Not in file</option>
                      {header.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {map.workType === undefined && map.role !== undefined && (
                <p className="mt-2 text-xs text-muted">
                  Work type comes from the category: Day Nanny = day; Live-In
                  and Japa Nanny = live-in.
                </p>
              )}
            </section>

            <section>
              <p className="text-sm font-bold text-plum">
                {plan.rows.length} of {body.length} rows will be imported
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {plan.duplicatesInFile.length > 0 && (
                  <li>
                    Skipped {plan.duplicatesInFile.length} repeated in the file
                    (same phone):{" "}
                    {plan.duplicatesInFile
                      .map((d) => `${d.name} (same number as ${d.keptAs})`)
                      .join(", ")}
                  </li>
                )}
                {plan.alreadyInDatabase.length > 0 && (
                  <li>
                    Skipped {plan.alreadyInDatabase.length} already in the list:{" "}
                    {plan.alreadyInDatabase.map((d) => d.name).join(", ")}
                  </li>
                )}
                {plan.noPhone.length > 0 && (
                  <li>
                    No valid phone (imported anyway): {plan.noPhone.join(", ")}
                  </li>
                )}
                {plan.skippedNoName > 0 && (
                  <li>Skipped {plan.skippedNoName} rows without a name.</li>
                )}
              </ul>
              <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-white">
                <table className="w-full text-xs text-plum">
                  <thead className="border-b border-line text-left text-muted">
                    <tr>
                      {[
                        "Name",
                        "Phone",
                        "Alt",
                        "Role",
                        "Age",
                        "Exp",
                        "Languages",
                        "Work",
                        "Area",
                        "City",
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-2 py-1.5 font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {plan.rows.slice(0, 10).map((n, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {n.name}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {n.phone ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {n.altPhone ?? ""}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {n.role ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">{n.age ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          {n.experienceYears ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {n.languages.join(", ") || "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {n.workType ? WORK_TYPE_LABEL[n.workType] : "—"}
                        </td>
                        <td className="px-2 py-1.5">{n.area ?? "—"}</td>
                        <td className="px-2 py-1.5">{n.city ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.rows.length > 10 && (
                <p className="mt-1 text-xs text-muted">Showing the first 10.</p>
              )}
            </section>
          </>
        )}
        {msg && (
          <p className="rounded-xl bg-white px-3 py-2 text-sm text-plum ring-1 ring-line">
            {msg}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-4">
        <button
          type="button"
          onClick={run}
          disabled={busy || !plan.rows.length || map.name === undefined}
          className="h-11 flex-1 rounded-full bg-plum px-5 text-sm font-semibold text-milk hover:bg-plum-soft disabled:opacity-50"
        >
          {busy ? "Importing…" : `Import ${plan.rows.length || ""} nannies`}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-full px-4 text-sm font-semibold text-plum"
        >
          Close
        </button>
      </div>
    </SidePanel>
  );
}

/* ---------------- shared ---------------- */

export function SidePanel({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-30"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fade-in absolute inset-0 bg-plum/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`panel-in absolute inset-y-0 right-0 flex w-full flex-col bg-milk shadow-lift ${wide ? "max-w-[760px]" : "max-w-[480px]"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="truncate font-display text-2xl text-plum">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full text-plum hover:bg-plum/5"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** Last 10 digits, so "+91 97550 21536" and "9755021536" match. */
function phoneKey(p: string | null | undefined) {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-chevron h-10 rounded-full border border-line bg-white pl-4 text-sm font-medium text-plum focus:border-plum focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-[20px] border border-dashed border-line bg-paper/60 px-4 py-16 text-center text-sm text-muted">
      {children}
    </div>
  );
}

/* ---------------- documents ---------------- */

/**
 * Aadhaar and BGV report. Anyone on the servicing team can upload or replace
 * them (saved straight away); only admins can open them (Storage rules).
 */
function DocumentsBox({
  nanny,
  staff,
  demo,
}: {
  nanny: Nanny | null;
  staff: Staff;
  demo: boolean;
}) {
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<DocKind, string>>>({});
  const setErr = (k: DocKind, m: string | null) =>
    setErrors((e) => ({ ...e, [k]: m ?? undefined }));

  const upload = async (kind: DocKind, file: File | undefined) => {
    if (!file || !nanny) return;
    const problem = checkDocument(file);
    setErr(kind, problem);
    if (problem) return;
    setBusy(kind);
    try {
      if (!demo) await uploadNannyDocument(nanny, kind, file, staff.email);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setErr(
        kind,
        code === "storage/unauthorized" || code === "permission-denied"
          ? "You don't have permission to upload documents."
          : (e as Error).message || "Couldn't upload. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const open = async (kind: DocKind) => {
    const d = nanny?.documents?.[kind];
    if (!d) return;
    // Open the tab now (inside the click) so it isn't blocked, then point it at the file.
    const tab = window.open("", "_blank");
    try {
      const url = await documentUrl(d.path);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setErr(kind, "Couldn't open the file. Try again.");
    }
  };

  return (
    <section className="rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex items-center gap-1.5">
        <FileLock2 className="size-4 text-plum" aria-hidden="true" />
        <h3 className="text-sm font-bold text-plum">Documents</h3>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        PDF or image, 5 MB or less. Saved as soon as you upload.
      </p>
      {!nanny ? (
        <p className="mt-2 text-sm text-muted">
          Add the nanny first, then upload her documents.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {DOC_KINDS.map(({ kind, label }) => {
            const d = nanny.documents?.[kind];
            const at = d?.uploadedAt?.toDate?.() ?? null;
            return (
              <li key={kind} className="py-2.5 first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full ${d ? "bg-[#dcefe1] text-success" : "bg-milk text-muted"}`}
                  >
                    {d ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-plum">{label}</p>
                    <p className="truncate text-xs text-muted">
                      {d
                        ? `Uploaded${at ? ` ${formatDateTime(at)}` : ""}${d.uploadedBy ? ` by ${d.uploadedBy}` : ""} · ${(d.size / 1024 / 1024).toFixed(1)} MB ${d.contentType === "application/pdf" ? "PDF" : "image"}`
                        : "Not uploaded"}
                    </p>
                  </div>
                  {d && (
                    <button
                      type="button"
                      onClick={() => void open(kind)}
                      className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-plum ring-1 ring-line hover:bg-milk"
                    >
                      <Eye className="size-3.5" aria-hidden="true" /> View
                    </button>
                  )}
                  <label
                    className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-plum px-3 text-xs font-semibold text-milk hover:bg-plum-soft ${busy ? "pointer-events-none opacity-50" : ""}`}
                  >
                    {busy === kind ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Upload className="size-3.5" aria-hidden="true" />
                    )}
                    {busy === kind ? "Uploading…" : d ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                      className="sr-only"
                      onChange={(e) => {
                        void upload(kind, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {d && (
                    <button
                      type="button"
                      disabled={!!busy}
                      aria-label={`Remove ${label}`}
                      onClick={async () => {
                        if (
                          !(await confirmDialog({
                            title: `Remove her ${label}?`,
                            message:
                              "The file is deleted and can't be recovered.",
                            confirmLabel: "Remove",
                            danger: true,
                          }))
                        )
                          return;
                        try {
                          if (!demo)
                            await removeNannyDocument(nanny, kind, staff.email);
                        } catch {
                          setErr(kind, "Couldn't remove it. Try again.");
                        }
                      }}
                      className="grid size-8 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {errors[kind] && (
                  <p className="mt-1 pl-10 text-xs text-red-700" role="alert">
                    {errors[kind]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
