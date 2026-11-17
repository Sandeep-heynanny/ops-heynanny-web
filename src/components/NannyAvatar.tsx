/* eslint-disable @next/next/no-img-element */
/** Photo if there is one, otherwise initials. */
export function NannyAvatar({
  name,
  photoUrl,
  size = 40,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return photoUrl ? (
    <img
      src={photoUrl}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover ring-1 ring-line"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-blush font-semibold text-rose-deep ring-1 ring-line"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
