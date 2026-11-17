"use client";

/**
 * Google Maps (Places API (New) + Maps JavaScript API) for picking a location
 * in the Servicing form and on nannies, so nannies can be suggested by
 * distance. Loaded straight from Google (no npm package) only when a picker is
 * on screen. Needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a browser key restricted to
 * ops.heynanny.in and localhost, with "Maps JavaScript API" and "Places API
 * (New)" enabled). Without it the pickers fall back to a plain text box.
 */
export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const mapsConfigured = () => !!MAPS_KEY;

export { BENGALURU, distanceKm, validGeo, type GeoPlace } from "@/lib/geo";

/* ---- minimal typings for what we use (no @types/google.maps) ---- */
type LatLngLike = { lat(): number; lng(): number };
type AddressComponent = { longText: string | null; types: string[] };
export type PlaceDetails = { formattedAddress?: string | null; location?: LatLngLike | null; addressComponents?: AddressComponent[] | null; id?: string };
export type Suggestion = {
  placePrediction: {
    placeId: string;
    text: { text: string };
    mainText?: { text: string } | null;
    secondaryText?: { text: string } | null;
    toPlace(): PlaceDetails & { fetchFields(o: { fields: string[] }): Promise<unknown> };
  } | null;
};
type PlacesLib = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(req: Record<string, unknown>): Promise<{ suggestions: Suggestion[] }>;
  };
};
export type MapsMap = { setCenter(p: { lat: number; lng: number }): void; setZoom(z: number): void; addListener(ev: string, fn: (e: { latLng?: LatLngLike | null }) => void): unknown };
export type MapsMarker = { setPosition(p: { lat: number; lng: number }): void; getPosition(): LatLngLike | null; addListener(ev: string, fn: () => void): unknown };
type MapsLib = { Map: new (el: HTMLElement, o: Record<string, unknown>) => MapsMap };
type MarkerLib = { Marker: new (o: Record<string, unknown>) => MapsMarker };
type GoogleNS = { maps: { importLibrary(name: string): Promise<unknown> } };

let loading: Promise<GoogleNS> | null = null;

/** Loads Google's script once (dynamic library import), with a 15 s time-out. */
function loadGoogle(): Promise<GoogleNS> {
  const w = window as unknown as { google?: GoogleNS; __hnMapsReady?: () => void; gm_authFailure?: () => void };
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  if (loading) return loading;
  if (!MAPS_KEY) return Promise.reject(new Error("Map search isn't set up yet."));
  loading = new Promise<GoogleNS>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Google Maps didn't load. Check your connection.")), 15_000);
    w.__hnMapsReady = () => {
      window.clearTimeout(timer);
      if (w.google) resolve(w.google);
      else reject(new Error("Google Maps didn't load."));
    };
    // Called by Google when the key is wrong or not allowed on this site.
    w.gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event("hn-maps-auth-failed"));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&loading=async&language=en&region=IN&callback=__hnMapsReady`;
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Google Maps didn't load. Check your connection."));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export let authFailed = false;

export async function placesLib() {
  return (await (await loadGoogle()).maps.importLibrary("places")) as PlacesLib;
}
export async function mapsLibs() {
  const g = await loadGoogle();
  const [maps, marker] = await Promise.all([g.maps.importLibrary("maps"), g.maps.importLibrary("marker")]);
  return { ...(maps as MapsLib), ...(marker as MarkerLib) };
}

/** Area (neighbourhood / locality) and city from Google's address parts. */
export function areaAndCity(components: AddressComponent[] | null | undefined) {
  const find = (...types: string[]) => components?.find((c) => types.some((t) => c.types.includes(t)))?.longText ?? null;
  const city = find("locality", "administrative_area_level_3", "administrative_area_level_2");
  const area = find("sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2") ?? city;
  return { area, city: city === "Bangalore" ? "Bengaluru" : city };
}
