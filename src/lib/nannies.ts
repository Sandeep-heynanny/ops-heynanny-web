"use client";

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { useEffect, useState } from "react";

import { db, storage } from "@/lib/firebase";
import { validGeo, type GeoPlace } from "@/lib/geo";

/**
 * Caregiver database (Firestore `nannies`), managed on the Nannies page and used
 * to match nannies to servicing cases. Staff only (rules in the website repo).
 */
export type NannyStatus =
  "available" | "interviewing" | "placed" | "on_leave" | "inactive";
export type WorkType = "live_in" | "day" | "both";

export type Nanny = {
  id: string;
  name: string;
  phone: string | null;
  /** Second number, if any. */
  altPhone: string | null;
  photoUrl: string | null;
  /** Cloud Storage path when the photo was uploaded here (nannies/{id}/…). */
  photoPath?: string | null;
  age: number | null;
  /** "Japa Nanny", "Nanny", "Elderly care"… */
  role: string | null;
  experienceYears: number | null;
  languages: string[];
  workType: WorkType | null;
  /** Locality where she lives / prefers to work, e.g. "KR Puram". */
  area: string | null;
  /** e.g. "Bengaluru", "Mumbai", "Delhi". */
  city: string | null;
  /** Home state / town, shown on the profile card, e.g. "Madhya Pradesh". */
  nativePlace?: string | null;
  /** Where she lives / works from, picked on Google Maps (for suggesting her to nearby families). */
  address?: string | null;
  geo?: GeoPlace | null;
  /** "Verified · Trusted" badge on the profile card. On by default; untick to hide it. */
  verified?: boolean;
  skills: string[];
  status: NannyStatus;
  /** Aadhaar and BGV report (Storage paths only; admins open them). */
  documents?: Partial<Record<DocKind, NannyDocument>>;
  /** Set while she's placed with a family. */
  placement?: {
    caseId: string;
    customerName: string | null;
    since: string | null;
  } | null;
  /** Internal, never shown to customers. */
  notes?: string;
  createdAt?: Timestamp | null;
  /** Who first added her. Set once; edits never change it. */
  createdBy?: string | null;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
};

export type NannyInput = Omit<
  Nanny,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export const NANNY_STATUS_META: Record<
  NannyStatus,
  { label: string; tone: string }
> = {
  available: { label: "Available", tone: "bg-[#dcefe1] text-success" },
  interviewing: { label: "Interviewing", tone: "bg-[#e3edfd] text-[#1a56c4]" },
  placed: { label: "Placed", tone: "bg-plum text-milk" },
  on_leave: { label: "On leave", tone: "bg-[#fbecc8] text-[#7a5410]" },
  inactive: { label: "Inactive", tone: "bg-beige text-muted" },
};

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  live_in: "Live-in",
  day: "Day",
  both: "Live-in or day",
};

/** Customer-safe profile copied onto a servicing case (no phone or notes). */
export type NannySnapshot = Pick<
  Nanny,
  | "name"
  | "photoUrl"
  | "role"
  | "age"
  | "experienceYears"
  | "languages"
  | "workType"
  | "area"
  | "skills"
> & { city?: string | null };

export function nannySnapshot(n: Nanny): NannySnapshot {
  return {
    name: n.name,
    photoUrl: n.photoUrl,
    role: n.role,
    age: n.age,
    experienceYears: n.experienceYears,
    languages: n.languages,
    workType: n.workType,
    area: n.area,
    city: n.city,
    skills: n.skills,
  };
}

/** One line for WhatsApp / lists: "Uma GP · 27 yrs · 4 yrs exp · Kannada, Hindi · Day · Hulimavu". */
export function nannySummary(n: NannySnapshot) {
  return [
    n.name,
    n.role,
    n.age ? `${n.age} yrs` : null,
    n.experienceYears !== null && n.experienceYears !== undefined
      ? `${n.experienceYears} yrs experience`
      : null,
    n.languages.length ? n.languages.join(", ") : null,
    n.workType ? WORK_TYPE_LABEL[n.workType] : null,
    nannyPlace(n),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "KR Puram, Bengaluru" (city left out when it's the same as the area). */
export function nannyPlace(n: { area: string | null; city?: string | null }) {
  const parts = [n.area, n.city].filter((x): x is string => !!x);
  return (
    [...new Set(parts.map((p) => p.trim()))]
      .filter(
        (p, i, all) =>
          all.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i,
      )
      .join(", ") || null
  );
}

export function useNannies(enabled: boolean, demo?: Nanny[]) {
  const [state, setState] = useState<{
    nannies: Nanny[];
    loading: boolean;
    error: string | null;
  }>(
    demo
      ? { nannies: demo, loading: false, error: null }
      : { nannies: [], loading: true, error: null },
  );
  useEffect(() => {
    if (!enabled || demo) return;
    return onSnapshot(
      collection(db(), "nannies"),
      (snap) =>
        setState({
          nannies: snap.docs
            .map((d) => normaliseNanny(d.id, d.data()))
            .sort((a, b) => a.name.localeCompare(b.name)),
          loading: false,
          error: null,
        }),
      (err) =>
        setState({
          nannies: [],
          loading: false,
          error:
            err.code === "permission-denied"
              ? "No permission to read nannies. Check that the latest Firestore rules are deployed."
              : "Couldn't load nannies.",
        }),
    );
  }, [enabled, demo]);
  return state;
}

/** Tolerates older or hand-edited documents. */
export function normaliseNanny(id: string, d: Record<string, unknown>): Nanny {
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const status = [
    "available",
    "interviewing",
    "placed",
    "on_leave",
    "inactive",
  ].includes(d.status as string)
    ? (d.status as NannyStatus)
    : "available";
  const workType = ["live_in", "day", "both"].includes(d.workType as string)
    ? (d.workType as WorkType)
    : null;
  return {
    id,
    name: str(d.name) ?? "Unnamed",
    phone: str(d.phone),
    altPhone: str(d.altPhone),
    photoUrl: str(d.photoUrl),
    photoPath: str(d.photoPath),
    age: num(d.age),
    role: str(d.role),
    experienceYears: num(d.experienceYears),
    languages: arr(d.languages),
    workType,
    area: str(d.area),
    city: str(d.city),
    nativePlace: str(d.nativePlace),
    address: str(d.address),
    geo: validGeo(d.geo) ? (d.geo as GeoPlace) : null,
    // Verified by HeyNanny unless someone unticks it.
    verified: d.verified !== false,
    skills: arr(d.skills),
    status,
    placement: (d.placement as Nanny["placement"]) ?? null,
    documents: (d.documents as Nanny["documents"]) ?? {},
    notes: typeof d.notes === "string" ? d.notes : "",
    createdAt: (d.createdAt as Timestamp) ?? null,
    createdBy: str(d.createdBy),
    updatedAt: (d.updatedAt as Timestamp) ?? null,
    updatedBy: str(d.updatedBy) ?? undefined,
  };
}

/** An id for a nanny that isn't saved yet, so her photo can be uploaded under it first. */
export const newNannyId = () => doc(collection(db(), "nannies")).id;

export async function saveNanny(
  id: string,
  input: NannyInput,
  by: string,
  isNew: boolean,
) {
  const data = { ...input, updatedAt: serverTimestamp(), updatedBy: by };
  if (isNew)
    await setDoc(doc(db(), "nannies", id), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: by,
    });
  else await updateDoc(doc(db(), "nannies", id), data);
}

export async function deleteNanny(
  n: Pick<Nanny, "id" | "photoPath" | "documents">,
) {
  await deleteDoc(doc(db(), "nannies", n.id));
  if (n.photoPath) await deleteNannyPhoto(n.photoPath);
  // Her Aadhaar / BGV files go too.
  for (const d of Object.values(n.documents ?? {}))
    if (d?.path)
      await deleteObject(ref(storage(), d.path)).catch(() => undefined);
}

/* ---------------- photos ---------------- */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_EDGE = 1200;

/**
 * Checks the picked file (an image, 5 MB or less) and shrinks it to a JPEG at
 * most 1200 px on the long edge, which is plenty for the profile card and keeps
 * uploads small.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (
    !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) &&
    !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
  )
    throw new Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > PHOTO_MAX_BYTES)
    throw new Error(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Choose one that's 5 MB or less.`,
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read that photo. Try a JPG or PNG.");
  }
  const scale = Math.min(
    1,
    PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("Couldn't process that photo.");
  if (blob.size > PHOTO_MAX_BYTES)
    throw new Error(
      "That photo is still over 5 MB after resizing. Try another.",
    );
  return blob;
}

export async function uploadNannyPhoto(
  nannyId: string,
  blob: Blob,
): Promise<{ url: string; path: string }> {
  const path = `nannies/${nannyId}/photo-${Date.now()}.jpg`;
  const r = ref(storage(), path);
  await uploadBytes(r, blob, {
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000",
  });
  return { url: await getDownloadURL(r), path };
}

/** Best effort: an old photo left behind isn't worth failing a save over. */
export async function deleteNannyPhoto(path: string) {
  await deleteObject(ref(storage(), path)).catch(() => undefined);
}

/** Adds many nannies in batches of 400 (Firestore's limit is 500 writes per batch). */
export async function importNannies(rows: NannyInput[], by: string) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db());
    for (const r of rows.slice(i, i + 400)) {
      batch.set(doc(collection(db(), "nannies")), {
        ...r,
        createdAt: serverTimestamp(),
        createdBy: by,
        updatedAt: serverTimestamp(),
        updatedBy: by,
      });
    }
    await batch.commit();
  }
}

/* ---------------- documents (Aadhaar, BGV report) ---------------- */

export type DocKind = "aadhaar" | "bgv";
export const DOC_KINDS: { kind: DocKind; label: string }[] = [
  { kind: "aadhaar", label: "Aadhaar" },
  { kind: "bgv", label: "BGV report" },
];
export type NannyDocument = {
  /** Storage path. No download link is stored: only admins can open the file. */
  path: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: Timestamp | null;
  uploadedBy: string;
};

export const DOC_MAX_BYTES = 5 * 1024 * 1024;
const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** PDF, JPG, PNG or WebP, 5 MB or less. Returns an error message, or null if it's fine. */
export function checkDocument(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type =
    file.type ||
    (
      {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      } as Record<string, string>
    )[ext] ||
    "";
  if (!DOC_TYPES[type]) return "Upload a PDF or an image (JPG, PNG or WebP).";
  if (file.size > DOC_MAX_BYTES)
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. It must be 5 MB or less.`;
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * Uploads the document and records it on the nanny straight away (the old
 * file, if any, is removed). The nanny must already be saved.
 */
export async function uploadNannyDocument(
  nanny: Pick<Nanny, "id" | "documents">,
  kind: DocKind,
  file: File,
  by: string,
): Promise<NannyDocument> {
  const problem = checkDocument(file);
  if (problem) throw new Error(problem);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    file.type ||
    (ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg");
  const path = `nannies/${nanny.id}/docs/${kind}-${Date.now()}.${DOC_TYPES[contentType]}`;
  await uploadBytes(ref(storage(), path), file, {
    contentType,
    cacheControl: "private, no-store",
    contentDisposition: "inline",
  });
  const info: NannyDocument = {
    path,
    name: file.name.slice(0, 120),
    contentType,
    size: file.size,
    uploadedAt: Timestamp.now(),
    uploadedBy: by,
  };
  await updateDoc(doc(db(), "nannies", nanny.id), {
    [`documents.${kind}`]: info,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  const old = nanny.documents?.[kind]?.path;
  if (old && old !== path)
    await deleteObject(ref(storage(), old)).catch(() => undefined);
  return info;
}

export async function removeNannyDocument(
  nanny: Pick<Nanny, "id" | "documents">,
  kind: DocKind,
  by: string,
) {
  const old = nanny.documents?.[kind]?.path;
  await updateDoc(doc(db(), "nannies", nanny.id), {
    [`documents.${kind}`]: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  if (old) await deleteObject(ref(storage(), old)).catch(() => undefined);
}

/** Admins only (Storage rules refuse everyone else): a link to open the file in a new tab. Don't share it. */
export async function documentUrl(path: string) {
  return getDownloadURL(ref(storage(), path));
}
