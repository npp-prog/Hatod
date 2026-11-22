'use client';

import type { LatLng } from '@hatod/shared';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';

/**
 * Tap-to-pin map (Leaflet + OpenStreetMap tiles). Loaded only on screens that
 * need it, through next/dynamic, so it never weighs down the home page.
 * The pin is a CSS marker: no image downloads, crisp on any screen.
 */
export default function MapPicker({
  center,
  value,
  onChange,
  zoom = 16,
  label,
  attribution,
}: {
  center: LatLng;
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  zoom?: number;
  label: string;
  attribution: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
      [center.lat, center.lng],
      zoom,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ${attribution}`,
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; center/zoom changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when the barangay changes.
  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom() < zoom ? zoom : map.current.getZoom());
  }, [center.lat, center.lng, zoom]);

  // Show / move the pin.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const icon = L.divIcon({ className: 'hatod-pin', html: '<span></span>', iconSize: [32, 42], iconAnchor: [16, 42] });
      marker.current = L.marker([value.lat, value.lng], { icon, draggable: true, keyboard: true, title: label }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
  }, [value, label]);

  return <div ref={el} role="application" aria-label={label} className="h-72 w-full overflow-hidden rounded-xl border-2 border-line" />;
}
