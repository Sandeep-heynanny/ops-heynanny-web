/* eslint-disable @next/next/no-img-element */
import {
  Baby,
  Briefcase,
  CalendarDays,
  Clock,
  Footprints,
  Heart,
  MapPin,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Nanny, NannySnapshot } from "@/lib/nannies";

/**
 * The nanny profile card sent to customers (WhatsApp PDF), drawn at 905 × 1280
 * to match HeyNanny's design. Customer-safe: no phone numbers or notes.
 */
export const CARD_W = 905;
export const CARD_H = 1280;

export type ProfileData = Pick<
  Nanny,
  | "name"
  | "role"
  | "age"
  | "experienceYears"
  | "languages"
  | "workType"
  | "area"
> & {
  city?: string | null;
  nativePlace?: string | null;
  verified?: boolean;
};

export const profileData = (n: Nanny | NannySnapshot): ProfileData => ({
  name: n.name,
  role: n.role,
  age: n.age,
  experienceYears: n.experienceYears,
  languages: n.languages,
  workType: n.workType,
  area: n.area,
  city: n.city ?? null,
  nativePlace: "nativePlace" in n ? (n.nativePlace ?? null) : null,
  verified: "verified" in n ? n.verified !== false : true,
});

const NAVY = "#2b3458";
const PEACH = "#fcebe1";
const CORAL = "#f0876b";
const ICON_BG = "#f9d6c4";
const CARD_BORDER = "#f1d2c3";

const years = (n: number | null) =>
  n === null ? "—" : `${n} ${n === 1 ? "Year" : "Years"}`;
const HOURS: Record<string, string> = {
  live_in: "Live - In",
  day: "Day",
  both: "Live - In or Day",
};

export function ProfileCard({
  p,
  photoSrc,
  logoSrc = "/assets/brand/hey-nanny-logo-navy.png",
}: {
  p: ProfileData;
  photoSrc: string | null;
  logoSrc?: string;
}) {
  const first = p.name.trim().split(/\s+/)[0] ?? p.name;
  const initials = p.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        background: PEACH,
        color: NAVY,
        position: "relative",
        overflow: "hidden",
        padding: "40px 42px",
        boxSizing: "border-box",
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
      }}
    >
      {/* decorations */}
      <Deco x={40} y={30} rot={-25}>
        <Heart size={30} fill={CORAL} color={CORAL} />
      </Deco>
      <Deco x={72} y={20} rot={15}>
        <Heart size={20} fill={CORAL} color={CORAL} />
      </Deco>
      <Deco x={828} y={238} rot={12}>
        <Heart size={34} fill={CORAL} color={CORAL} />
      </Deco>
      <Deco x={780} y={540} rot={-20}>
        <Footprints size={64} color="#f3a58b" />
      </Deco>
      <Deco x={52} y={1170} rot={-30}>
        <Footprints size={56} color="#f3a58b" />
      </Deco>
      <Deco x={800} y={1160} rot={20}>
        <Footprints size={56} color="#f3a58b" />
      </Deco>

      {/* top */}
      <div style={{ display: "flex", gap: 30, height: 540 }}>
        <div
          style={{
            position: "relative",
            width: 420,
            flexShrink: 0,
            marginTop: 50,
          }}
        >
          <div
            style={{
              width: 420,
              height: 500,
              borderRadius: 52,
              border: `5px solid ${NAVY}`,
              overflow: "hidden",
              background: "#fff8ef",
              boxSizing: "border-box",
            }}
          >
            {photoSrc ? (
              <img
                src={photoSrc}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  background: "#f6d9d6",
                  color: "#93525a",
                  fontSize: 140,
                  fontWeight: 700,
                }}
              >
                {initials || "?"}
              </div>
            )}
          </div>
          {p.verified && <VerifiedBadge />}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <img
            src={logoSrc}
            alt="HeyNanny"
            style={{ width: 230, height: "auto", marginTop: 10 }}
          />
          <p
            style={{
              margin: "26px 0 0",
              fontSize: 50,
              fontWeight: 800,
              letterSpacing: -0.5,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            Meet {first}
          </p>
          <div
            style={{
              width: 100,
              height: 7,
              flexShrink: 0,
              borderRadius: 4,
              background: CORAL,
              marginTop: 14,
              alignSelf: "flex-start",
              marginLeft: 20,
            }}
          />
          <div
            style={{
              marginTop: 26,
              width: "100%",
              borderRadius: 26,
              border: `2px solid ${CARD_BORDER}`,
              background: "rgba(255,255,255,0.35)",
              padding: "26px 28px",
              boxSizing: "border-box",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 40,
                fontWeight: 800,
                textAlign: "center",
                lineHeight: 1.15,
              }}
            >
              {p.name}
            </p>
            <Line
              icon={<MapPin size={30} fill={NAVY} color={PEACH} />}
              text={p.nativePlace || p.city || "Bengaluru"}
            />
            <Line
              icon={<Baby size={30} color={NAVY} />}
              text={p.role || "Nanny"}
            />
          </div>
        </div>
      </div>

      {/* facts */}
      <div
        style={{
          marginTop: 30,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <Fact
          icon={<Briefcase size={40} color={NAVY} />}
          label="Experience"
          value={years(p.experienceYears)}
        />
        <Fact
          icon={<MessagesSquare size={40} color={NAVY} />}
          label="Languages"
          value={p.languages.length ? p.languages.join(", ") : "—"}
        />
        <Fact
          icon={<UserRound size={40} color={NAVY} />}
          label="Age"
          value={years(p.age)}
        />
        <Fact
          icon={<MapPin size={40} color={NAVY} />}
          label="Work Location"
          value={p.city || p.area || "Bengaluru"}
        />
        <Fact
          icon={<Clock size={40} color={NAVY} />}
          label="Preferred hours"
          value={p.workType ? HOURS[p.workType]! : "Confirm with coordinator"}
        />
        <Fact
          icon={<CalendarDays size={40} color={NAVY} />}
          label="Availability"
          value="Confirm with coordinator"
        />
      </div>

      {/* footer */}
      <div
        style={{
          marginTop: 20,
          borderRadius: 24,
          border: `2px solid ${CARD_BORDER}`,
          background: "rgba(255,255,255,0.35)",
          padding: "26px 30px 26px 110px",
          display: "flex",
          alignItems: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            background: "#fff",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <MessageCircle size={46} color={NAVY} strokeWidth={2.2} />
        </div>
        <p style={{ margin: 0, fontSize: 28, lineHeight: 1.3 }}>
          Speak with your HeyNanny
          <br />
          coordinator to arrange an interview.
        </p>
      </div>
    </div>
  );
}

function Deco({
  x,
  y,
  rot,
  children,
}: {
  x: number;
  y: number;
  rot: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${rot}deg)`,
        opacity: 0.9,
      }}
    >
      {children}
    </div>
  );
}

function Line({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        marginTop: 22,
        fontSize: 30,
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 40 }}>
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        borderRadius: 22,
        border: `2px solid ${CARD_BORDER}`,
        background: "rgba(255,255,255,0.35)",
        padding: "20px 20px",
        minHeight: 124,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          background: ICON_BG,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 29, fontWeight: 800 }}>{label}</p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: value.length > 22 ? 23 : 27,
            lineHeight: 1.25,
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <div
      style={{
        position: "absolute",
        right: -30,
        bottom: -30,
        width: 150,
        height: 150,
        borderRadius: 75,
        background: "#fff",
        border: `6px solid ${NAVY}`,
        boxShadow: "0 0 0 5px #fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5 }}>
        VERIFIED
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          margin: "2px 0",
        }}
      >
        <Heart size={14} fill="#e5484d" color="#e5484d" />
        <ShieldCheck size={46} fill={NAVY} color="#fff" strokeWidth={2} />
        <Heart size={14} fill="#e5484d" color="#e5484d" />
      </span>
      <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5 }}>
        TRUSTED
      </span>
    </div>
  );
}
