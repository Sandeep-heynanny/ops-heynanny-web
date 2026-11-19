/**
 * Locations from the Google Maps picker (customers in the Servicing form,
 * nannies on their profile) and the distance between them. Shared by the
 * browser and the server, so no browser-only code here.
 */
/** Where a customer or nanny is, from the map picker. */
export type GeoPlace = {
  lat: number;
  lng: number;
  placeId: string | null;
  /** Locality / neighbourhood, e.g. "HSR Layout". */
  area: string | null;
  city: string | null;
  /** The pin was dragged after picking (the address text is from the search). */
  pinMoved?: boolean;
};

/** Bengaluru: searches lean towards it, maps open on it. */
export const BENGALURU = { lat: 12.9716, lng: 77.5946 };

/** Straight-line distance in km. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sanity check for a picked place (in or near India). */
export function validGeo(g: unknown): g is GeoPlace {
  const x = g as GeoPlace | null;
  return (
    !!x &&
    Number.isFinite(x.lat) &&
    Number.isFinite(x.lng) &&
    x.lat > 5 &&
    x.lat < 38 &&
    x.lng > 67 &&
    x.lng < 99
  );
}
