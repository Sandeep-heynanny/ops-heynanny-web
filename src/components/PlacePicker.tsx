"use client";

import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { areaAndCity, BENGALURU, mapsConfigured, mapsLibs, placesLib, type GeoPlace, type MapsMap, type MapsMarker, type Suggestion } from "@/lib/maps";

/**
 * Google Maps location picker: type, pick a suggestion, and the address plus
 * its map position are saved; the pin can be dragged to the exact spot. If Maps
 * isn't set up (no key) or doesn't load, it's a plain text box.
 */
export function PlacePicker({
  address,
  geo,
  onChange,
  placeholder = "Search the area, society or address",
  invalid,
}: {
  address: string;
  geo: GeoPlace | null;
  onChange: (next: { address: string; geo: GeoPlace | null }) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [maps, setMaps] = useState<"off" | "on" | "failed">(mapsConfigured() ? "on" : "off");
  const [failReason, setFailReason] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const session = useRef<object | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const listId = useId();

  useEffect(() => {
    const onAuth = () => {
      setMaps("failed");
      setFailReason("The Google Maps key isn't allowed on this site. Type the address instead.");
    };
    window.addEventListener("hn-maps-auth-failed", onAuth);
    return () => window.removeEventListener("hn-maps-auth-failed", onAuth);
  }, []);

  const search = (q: string) => {
    window.clearTimeout(timer.current);
    if (maps !== "on" || q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const lib = await placesLib();
        session.current ??= new lib.AutocompleteSessionToken();
        const { suggestions: s } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: session.current,
          includedRegionCodes: ["in"],
          locationBias: { center: BENGALURU, radius: 50_000 },
          language: "en-IN",
        });
        setSuggestions(s.filter((x) => x.placePrediction).slice(0, 6));
        setActive(0);
        setOpen(true);
      } catch (e) {
        setMaps("failed");
        setFailReason(`${(e as Error).message || "Map search failed."} Type the address instead.`);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const pick = async (s: Suggestion) => {
    const p = s.placePrediction;
    if (!p) return;
    setOpen(false);
    setPicking(true);
    try {
      const place = p.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
      session.current = null; // a session ends with the pick
      const loc = place.location;
      if (!loc) throw new Error("no location");
      const { area, city } = areaAndCity(place.addressComponents);
      onChange({
        address: place.formattedAddress || p.text.text,
        geo: { lat: Number(loc.lat().toFixed(6)), lng: Number(loc.lng().toFixed(6)), placeId: p.placeId, area, city },
      });
    } catch {
      setFailReason("Couldn't get that place. Try another suggestion.");
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="mt-1">
      <div className="relative">
        {maps === "on" ? (
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        ) : (
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        )}
        <input
          value={address}
          role={maps === "on" ? "combobox" : undefined}
          aria-expanded={maps === "on" ? open : undefined}
          aria-controls={maps === "on" ? listId : undefined}
          aria-autocomplete={maps === "on" ? "list" : undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            // Typing again means the old pin no longer matches.
            onChange({ address: e.target.value, geo: null });
            search(e.target.value);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void pick(suggestions[active]!);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={maps === "on" ? placeholder : "Area and address, e.g. ISRO Layout, near…"}
          maxLength={300}
          className={`h-10 w-full rounded-xl border bg-white pl-9 pr-9 text-sm text-plum focus:border-plum focus:outline-none ${invalid ? "border-red-400" : "border-line"}`}
        />
        {(searching || picking) && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden="true" />}
        {!searching && !picking && address && (
          <button
            type="button"
            aria-label="Clear location"
            onClick={() => {
              onChange({ address: "", geo: null });
              setSuggestions([]);
            }}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-plum"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-soft ring-1 ring-line">
            {suggestions.map((s, i) => (
              <li
                key={s.placePrediction!.placeId}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? "bg-milk" : ""}`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-plum">{s.placePrediction!.mainText?.text ?? s.placePrediction!.text.text}</span>
                  {s.placePrediction!.secondaryText?.text && <span className="block truncate text-xs text-muted">{s.placePrediction!.secondaryText.text}</span>}
                </span>
              </li>
            ))}
            <li className="px-3 pb-1 pt-1.5 text-right text-[0.65rem] text-muted">Powered by Google</li>
          </ul>
        )}
      </div>

      {maps === "on" && geo && <PinMap geo={geo} onMove={(g) => onChange({ address, geo: g })} />}
      {maps === "on" && !geo && address.trim() && !searching && !picking && (
        <p className="mt-1 text-xs text-[#7a5410]">Pick a suggestion from the list so the location is on the map.</p>
      )}
      {maps === "off" && <p className="mt-1 text-xs text-muted">Map search isn&apos;t set up yet, so type the address.</p>}
      {failReason && <p className="mt-1 text-xs text-red-700">{failReason}</p>}
    </div>
  );
}

/** Small map with a draggable pin to fine-tune the spot. */
function PinMap({ geo, onMove }: { geo: GeoPlace; onMove: (g: GeoPlace) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapsMap | null>(null);
  const marker = useRef<MapsMarker | null>(null);
  const latest = useRef({ geo, onMove });
  useEffect(() => {
    latest.current = { geo, onMove };
  });

  useEffect(() => {
    let off = false;
    void mapsLibs().then(({ Map, Marker }) => {
      if (off || !el.current || map.current) return;
      const center = { lat: latest.current.geo.lat, lng: latest.current.geo.lng };
      map.current = new Map(el.current, { center, zoom: 16, disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "cooperative" });
      marker.current = new Marker({ map: map.current, position: center, draggable: true, title: "Drag to the exact spot" });
      const moveTo = (lat: number, lng: number) => {
        const g = latest.current.geo;
        latest.current.onMove({ ...g, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), pinMoved: true });
      };
      marker.current.addListener("dragend", () => {
        const p = marker.current?.getPosition();
        if (p) moveTo(p.lat(), p.lng());
      });
      map.current.addListener("click", (e) => {
        if (!e.latLng) return;
        marker.current?.setPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        moveTo(e.latLng.lat(), e.latLng.lng());
      });
    });
    return () => {
      off = true;
    };
  }, []);

  // Follow a new pick.
  useEffect(() => {
    const p = { lat: geo.lat, lng: geo.lng };
    marker.current?.setPosition(p);
    if (!geo.pinMoved) map.current?.setCenter(p);
  }, [geo.lat, geo.lng, geo.pinMoved]);

  return (
    <div className="mt-2">
      <div ref={el} className="h-44 w-full overflow-hidden rounded-xl bg-beige ring-1 ring-line" aria-label="Map: drag the pin to the exact spot" />
      <p className="mt-1 text-xs text-muted">
        {geo.area ? `${geo.area}${geo.city && geo.city !== geo.area ? `, ${geo.city}` : ""} · ` : ""}
        {geo.pinMoved ? "Pin adjusted." : "Drag the pin (or tap the map) if the spot isn't exact."}
      </p>
    </div>
  );
}
