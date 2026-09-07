'use client';

import type { Circle, CircleMarker, Map } from 'leaflet';
import { useEffect, useRef } from 'react';

interface Point { latitude: number; longitude: number }
interface CurrentPoint extends Point { accuracy: number }

export default function AttendanceMap({ work, current, radiusMeters }: { work: Point | null; current: CurrentPoint | null; radiusMeters: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const currentMarkerRef = useRef<CircleMarker | null>(null);
  const accuracyCircleRef = useRef<Circle | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (!containerRef.current || !work) return;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current).setView([work.latitude, work.longitude], 17);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      L.circle([work.latitude, work.longitude], { radius: radiusMeters, color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.18 }).addTo(map);
      L.circleMarker([work.latitude, work.longitude], { radius: 7, color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Lokasi kerja').addTo(map);
      const point = currentRef.current;
      if (point) {
        currentMarkerRef.current = L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 }).bindTooltip('Lokasi Anda').addTo(map);
        accuracyCircleRef.current = L.circle([point.latitude, point.longitude], { radius: point.accuracy, color: '#16a34a', fillOpacity: 0.08, weight: 1 }).addTo(map);
      }
      map.fitBounds(L.circle([work.latitude, work.longitude], { radius: Math.max(radiusMeters, 50) }).getBounds(), { padding: [24, 24] });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      currentMarkerRef.current = null;
      accuracyCircleRef.current = null;
    };
  }, [work?.latitude, work?.longitude, radiusMeters]);

  useEffect(() => {
    if (!current || !mapRef.current) return;
    void import('leaflet').then((L) => {
      const point: [number, number] = [current.latitude, current.longitude];
      if (currentMarkerRef.current) currentMarkerRef.current.setLatLng(point);
      else currentMarkerRef.current = L.circleMarker(point, { radius: 8, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 }).bindTooltip('Lokasi Anda').addTo(mapRef.current!);
      if (accuracyCircleRef.current) accuracyCircleRef.current.setLatLng(point).setRadius(current.accuracy);
      else accuracyCircleRef.current = L.circle(point, { radius: current.accuracy, color: '#16a34a', fillOpacity: 0.08, weight: 1 }).addTo(mapRef.current!);
    });
  }, [current]);

  if (!work) return <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">Koordinat lokasi kerja belum dikonfigurasi.</div>;
  return <div ref={containerRef} className="h-72 w-full rounded-xl border border-slate-200" aria-label="Peta verifikasi lokasi absensi" />;
}
