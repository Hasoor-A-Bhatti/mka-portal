"use client";

// Storage locations on a map. Loaded only when someone switches to the map,
// so Leaflet never runs on the server or slows down the list view.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, Move, X } from "lucide-react";
import type { Item, Location } from "@/lib/storage";
import { setLocationPin } from "@/app/(portal)/storage/actions";
import { FormError, useRun } from "@/components/fleet/ui";
import { Pill } from "./bits";

type Group = { key: string; lat: number; lng: number; label: string; locations: Location[]; items: Item[] };

// OpenStreetMap's own tiles: free for light use like this, with the credit shown.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARD_WIDTH = 352;
const SHOWN_ITEMS = 8;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hasPin = (l: Location) => typeof l.latitude === "number" && typeof l.longitude === "number";
const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export default function LocationsMap({ locations, items, canManage }: { locations: Location[]; items: Item[]; canManage: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pins = useRef<{ p: Group; marker: L.Marker }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Location | null>(null);
  const { pending, error, run } = useRun();

  // Locations at the same spot share one pin (the three AeM containers, say).
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const l of locations) {
      if (!hasPin(l)) continue;
      const key = keyOf(l.latitude!, l.longitude!);
      const g = m.get(key) ?? { key, lat: l.latitude!, lng: l.longitude!, label: "", locations: [], items: [] };
      g.locations.push(l);
      g.items.push(...items.filter((i) => i.location_id === l.id));
      m.set(key, g);
    }
    for (const g of m.values()) {
      const names = [...new Set(g.locations.map((l) => l.place || l.site || l.name))];
      g.label = names.join(" · ");
      g.locations.sort((a, b) => a.position - b.position);
    }
    return [...m.values()].sort((a, b) => b.lat - a.lat);
  }, [locations, items]);

  const unpinned = locations.filter((l) => !hasPin(l) && l.active);
  const open = groups.find((g) => g.key === selected) ?? null;

  // Make the map once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomSnap: 0.5, scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    const labels = () => {
      box.current?.classList.toggle("is-far", m.getZoom() < 9);
      placeLabels(m, pins.current);
    };
    m.on("zoomend", labels);
    // Wheel zoom only once someone has clicked into the map, so the page still scrolls.
    m.on("click", () => m.scrollWheelZoom.enable());
    m.on("mouseout", () => m.scrollWheelZoom.disable());
    map.current = m;
    if (groups.length) m.fitBounds(L.latLngBounds(groups.map((g) => [g.lat, g.lng])), { padding: box.current.clientWidth < 500 ? [22, 22] : [48, 48], maxZoom: 12 });
    else m.setView([51.25, -0.6], 9);
    labels();
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pins.
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    pins.current = [];
    for (const p of groups) {
      const icon = L.divIcon({
        className: "st-pin-wrap",
        html: `<span class="st-pin ${p.key === selected ? "is-on" : ""}">${p.items.length}</span><span class="st-pin-label">${esc(p.label)}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([p.lat, p.lng], { icon, title: `${p.label}: ${p.items.length} item${p.items.length === 1 ? "" : "s"}`, keyboard: true, riseOnHover: true, zIndexOffset: p.key === selected ? 1000 : 0 })
        .on("click", () => setSelected(p.key))
        .addTo(g);
      pins.current.push({ p, marker });
    }
    if (map.current) placeLabels(map.current, pins.current);
  }, [groups, selected]);

  // Keep the chosen pin clear of the card beside it.
  useEffect(() => {
    const m = map.current;
    const g = groups.find((x) => x.key === selected);
    if (!m || !g || !box.current || box.current.clientWidth <= 700) return;
    m.panInside([g.lat, g.lng], { paddingTopLeft: [40, 40], paddingBottomRight: [CARD_WIDTH + 30, 40] });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Placing a pin: the next click on the map says where.
  useEffect(() => {
    const m = map.current;
    if (!m || !placing) return;
    box.current?.classList.add("is-placing");
    const drop = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      run(
        () => setLocationPin(placing.id, lat, lng),
        () => {
          setPlacing(null);
          setSelected(keyOf(Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5));
        },
      );
    };
    m.on("click", drop);
    return () => {
      m.off("click", drop);
      box.current?.classList.remove("is-placing");
    };
  }, [placing]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (g: Group) => {
    setSelected(g.key);
    map.current?.flyTo([g.lat, g.lng], Math.max(map.current.getZoom(), 11), { duration: 0.6 });
  };

  return (
    <div className="st-map">
      <div className="st-map-wrap">
        <div ref={box} className="st-map-canvas" role="application" aria-label="Map of storage locations" />

        {placing && (
          <div className="st-map-banner glass glass-strong" role="status">
            <MapPin size={16} />
            <span>
              {pending ? "Saving…" : <>Click the map where <b>{placing.name}</b> is.</>}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPlacing(null)} disabled={pending}>
              Cancel
            </button>
          </div>
        )}

        {open && !placing && (
          <aside className="st-map-card glass glass-strong" aria-label={open.label}>
            <div className="st-map-card-head">
              <div>
                <h3>{open.label}</h3>
                <small>
                  {open.items.length} item{open.items.length === 1 ? "" : "s"} ·{" "}
                  {open.items.reduce((n, i) => n + i.quantity, 0).toLocaleString("en-GB")} units
                </small>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}>
                <X size={16} />
                <span className="sr-only">Close</span>
              </button>
            </div>
            {open.locations.map((l) => {
              const here = items.filter((i) => i.location_id === l.id).sort((a, b) => a.item_name.localeCompare(b.item_name));
              return (
                <section key={l.id} className="st-map-loc">
                  <h4>
                    {l.name}
                    {!l.active && <small> · not in use</small>}
                  </h4>
                  {here.length === 0 ? (
                    <p className="muted-note">Nothing stored here yet.</p>
                  ) : (
                    <ul>
                      {here.slice(0, SHOWN_ITEMS).map((i) => (
                        <li key={i.id}>
                          <span>{i.item_name}</span>
                          <b>×{i.quantity.toLocaleString("en-GB")}</b>
                          {i.status !== "In stock" && <Pill value={i.status} />}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="st-map-loc-foot">
                    <Link href={`/storage?location=${l.id}`}>
                      {here.length > SHOWN_ITEMS ? `All ${here.length} items` : "Open in inventory"} <ArrowRight size={13} />
                    </Link>
                    {canManage && (
                      <span>
                        <button type="button" className="link-btn" onClick={() => setPlacing(l)}>
                          <Move size={13} /> Move pin
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          disabled={pending}
                          onClick={() => window.confirm(`Take ${l.name} off the map?`) && run(() => setLocationPin(l.id, null, null), () => setSelected(null))}
                        >
                          Take off map
                        </button>
                      </span>
                    )}
                  </div>
                </section>
              );
            })}
          </aside>
        )}
      </div>

      <FormError error={error} />

      <div className="st-map-places" role="group" aria-label="Places">
        {groups.map((g) => (
          <button key={g.key} type="button" className="chip" aria-pressed={g.key === selected} onClick={() => show(g)}>
            <MapPin size={13} /> {g.label} <em>{g.items.length}</em>
          </button>
        ))}
      </div>

      {unpinned.length > 0 && (
        <div className="st-map-unpinned">
          <span className="muted-note">Not on the map yet:</span>
          {unpinned.map((l) =>
            canManage ? (
              <button key={l.id} type="button" className="chip" aria-pressed={placing?.id === l.id} onClick={() => (setSelected(null), setPlacing(l))}>
                <MapPin size={13} /> Place {l.name}
              </button>
            ) : (
              <span key={l.id} className="chip">
                {l.name}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Puts a pin's name on its left when the right would run into another pin. */
function placeLabels(m: L.Map, list: { p: Group; marker: L.Marker }[]) {
  const at = list.map(({ p }) => m.latLngToContainerPoint([p.lat, p.lng]));
  list.forEach(({ p, marker }, i) => {
    const width = 22 + p.label.length * 7.2;
    const blocked = at.some((q, j) => j !== i && q.x > at[i].x && q.x - at[i].x < 34 + width && Math.abs(q.y - at[i].y) < 26);
    marker.getElement()?.classList.toggle("is-left", blocked);
  });
}
