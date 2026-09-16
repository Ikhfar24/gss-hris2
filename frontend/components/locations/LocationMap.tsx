'use client';

import type { Circle, CircleMarker, Map } from 'leaflet';
import { useEffect, useRef, useState } from 'react';

interface Point {
  latitude: number;
  longitude: number;
}

export default function LocationMap({ point, radiusMeters, editable = false, onPick }: { point: Point | null; radiusMeters: number; editable?: boolean; onPick?: (point: Point) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const radiusRef = useRef<Circle | null>(null);
  const onPickRef = useRef(onPick);
  const [mapReady, setMapReady] = useState(false);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      map.fitWorld();
      setMapReady(true);
      map.on('click', (event) => {
        if (editable) onPickRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      });
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [editable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void import('leaflet').then((L) => {
      if (!mapRef.current) return;
      markerRef.current?.remove();
      radiusRef.current?.remove();
      markerRef.current = null;
      radiusRef.current = null;
      if (!point) {
        map.fitWorld();
        return;
      }
      const center: [number, number] = [point.latitude, point.longitude];
      radiusRef.current = L.circle(center, { radius: radiusMeters, color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.2, weight: 2 }).addTo(map);
      markerRef.current = L.circleMarker(center, { radius: 7, color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Pusat lokasi').addTo(map);
      map.fitBounds(radiusRef.current.getBounds(), { padding: [28, 28], maxZoom: 18 });
    });
  }, [mapReady, point?.latitude, point?.longitude, radiusMeters]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className={`h-64 w-full sm:h-72 ${editable ? 'cursor-crosshair' : ''}`} aria-label={editable ? 'Peta untuk memilih pusat lokasi' : 'Peta lokasi kerja'} />
      {!point && <p className="pointer-events-none absolute left-1/2 top-3 z-[400] -translate-x-1/2 rounded-lg bg-white/95 px-3 py-2 text-center text-xs font-medium text-slate-600 shadow">{editable ? 'Klik peta untuk memilih pusat lokasi' : 'Koordinat belum dikonfigurasi'}</p>}
    </div>
  );
}
