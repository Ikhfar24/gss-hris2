'use client';

import type { Circle, CircleMarker, Map } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Point { latitude: number; longitude: number }
interface CurrentPoint extends Point { accuracy: number }
type LeafletModule = typeof import('leaflet');
const EARTH_RADIUS_METERS = 6371000;

function validPoint(point: Point | null): point is Point {
  return !!point
    && Number.isFinite(point.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && Number.isFinite(point.longitude)
    && point.longitude >= -180
    && point.longitude <= 180;
}

function extendRadiusBounds(bounds: import('leaflet').LatLngBounds, point: Point, radiusMeters: number) {
  bounds.extend([point.latitude, point.longitude]);
  if (radiusMeters <= 0) return;
  const latitudeDelta = radiusMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitudeScale = Math.max(Math.cos(point.latitude * Math.PI / 180), 0.000001);
  const longitudeDelta = Math.min(180, latitudeDelta / longitudeScale);
  bounds.extend([Math.max(-90, point.latitude - latitudeDelta), Math.max(-180, point.longitude - longitudeDelta)]);
  bounds.extend([Math.min(90, point.latitude + latitudeDelta), Math.min(180, point.longitude + longitudeDelta)]);
}

export default function AttendanceMap({ work, current, radiusMeters, showGeofence = true, markerLabel = 'Lokasi perangkat', className }: { work: Point | null; current: CurrentPoint | null; radiusMeters: number; showGeofence?: boolean; markerLabel?: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const moduleRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<Map | null>(null);
  const workMarkerRef = useRef<CircleMarker | null>(null);
  const geofenceCircleRef = useRef<Circle | null>(null);
  const currentMarkerRef = useRef<CircleMarker | null>(null);
  const accuracyCircleRef = useRef<Circle | null>(null);
  const [leaflet, setLeaflet] = useState<LeafletModule | null>(null);
  const [moduleError, setModuleError] = useState(false);

  const workPoint = validPoint(work) ? work : null;
  const currentPoint = validPoint(current) ? current : null;
  const visibleWork = showGeofence ? workPoint : null;
  const hasAnchor = !!(visibleWork || currentPoint);
  const radius = Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 0;
  const accuracy = currentPoint && Number.isFinite(currentPoint.accuracy) && currentPoint.accuracy > 0 ? currentPoint.accuracy : 0;

  useEffect(() => {
    let active = true;
    void import('leaflet').then((loaded) => {
      if (!active) return;
      moduleRef.current = loaded;
      setLeaflet(loaded);
    }).catch(() => {
      if (active) setModuleError(true);
    });
    return () => {
      active = false;
      moduleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!leaflet || !container || !hasAnchor || mapRef.current) return;

    const map = leaflet.map(container, { zoomControl: true });
    mapRef.current = map;
    const initialPoint = visibleWork ?? currentPoint;
    map.setView([initialPoint!.latitude, initialPoint!.longitude], 17, { animate: false });
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    let frame = window.requestAnimationFrame(() => {
      if (mapRef.current === map) map.invalidateSize({ animate: false, pan: false });
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (mapRef.current === map) map.invalidateSize({ animate: false, pan: false });
      });
    });
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      if (mapRef.current !== map) return;
      mapRef.current = null;
      workMarkerRef.current = null;
      geofenceCircleRef.current = null;
      currentMarkerRef.current = null;
      accuracyCircleRef.current = null;
      map.remove();
    };
  }, [hasAnchor, leaflet]);

  useEffect(() => {
    const map = mapRef.current;
    const loaded = moduleRef.current;
    if (!map || !loaded || loaded !== leaflet) return;
    let cancelled = false;
    let fitFrame = 0;

    const remove = (layer: Circle | CircleMarker | null) => {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    };

    if (visibleWork) {
      const point: [number, number] = [visibleWork.latitude, visibleWork.longitude];
      if (workMarkerRef.current) workMarkerRef.current.setLatLng(point);
      else workMarkerRef.current = loaded.circleMarker(point, { radius: 7, color: '#001F3F', fillColor: '#29297A', fillOpacity: 1 }).bindTooltip('Lokasi kerja').addTo(map);
      if (radius) {
        if (geofenceCircleRef.current) geofenceCircleRef.current.setLatLng(point).setRadius(radius);
        else geofenceCircleRef.current = loaded.circle(point, { radius, color: '#001F3F', fillColor: '#29297A', fillOpacity: 0.14 }).addTo(map);
      } else {
        remove(geofenceCircleRef.current);
        geofenceCircleRef.current = null;
      }
    } else {
      remove(workMarkerRef.current);
      remove(geofenceCircleRef.current);
      workMarkerRef.current = null;
      geofenceCircleRef.current = null;
    }

    if (currentPoint) {
      const point: [number, number] = [currentPoint.latitude, currentPoint.longitude];
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setLatLng(point).setTooltipContent(markerLabel);
      } else {
        currentMarkerRef.current = loaded.circleMarker(point, { radius: 8, color: '#365314', fillColor: '#B6D588', fillOpacity: 1 }).bindTooltip(markerLabel).addTo(map);
      }
      if (accuracy) {
        if (accuracyCircleRef.current) accuracyCircleRef.current.setLatLng(point).setRadius(accuracy);
        else accuracyCircleRef.current = loaded.circle(point, { radius: accuracy, color: '#365314', fillColor: '#B6D588', fillOpacity: 0.1, weight: 1 }).addTo(map);
      } else {
        remove(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
    } else {
      remove(currentMarkerRef.current);
      remove(accuracyCircleRef.current);
      currentMarkerRef.current = null;
      accuracyCircleRef.current = null;
    }

    const bounds = loaded.latLngBounds([]);
    if (visibleWork) extendRadiusBounds(bounds, visibleWork, radius);
    if (currentPoint) extendRadiusBounds(bounds, currentPoint, accuracy);
    if (bounds.isValid()) {
      map.whenReady(() => {
        if (cancelled || mapRef.current !== map || moduleRef.current !== loaded) return;
        fitFrame = window.requestAnimationFrame(() => {
          if (cancelled || mapRef.current !== map || moduleRef.current !== loaded || !containerRef.current?.isConnected) return;
          map.invalidateSize({ animate: false, pan: false });
          if (!cancelled && mapRef.current === map) map.fitBounds(bounds, { animate: false, maxZoom: 17, padding: [24, 24] });
        });
      });
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(fitFrame);
    };
  }, [accuracy, currentPoint?.latitude, currentPoint?.longitude, leaflet, markerLabel, radius, visibleWork?.latitude, visibleWork?.longitude]);

  if (!hasAnchor) {
    let message = showGeofence ? 'Koordinat lokasi kerja belum dikonfigurasi.' : 'Menunggu koordinat GPS saat ini.';
    if (work && showGeofence) message = 'Koordinat lokasi kerja tidak valid.';
    if (current) message = 'Koordinat GPS saat ini tidak valid.';
    return <div className={cn('flex h-56 min-w-0 max-w-full items-center justify-center rounded-xl border border-border bg-surface-subtle px-4 text-center text-body text-muted', className)}>{message}</div>;
  }

  return <div className={cn('relative isolate h-56 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-background sm:h-64', className)}><div ref={containerRef} role="img" className="absolute inset-0 min-w-0 max-w-full" aria-label="Peta verifikasi lokasi absensi" />{moduleError && <div role="alert" className="absolute inset-0 z-[500] flex items-center justify-center bg-danger-surface px-4 text-center text-body text-danger">Peta tidak dapat dimuat. Periksa koneksi lalu coba lagi.</div>}{!leaflet && !moduleError && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-muted" role="status">Memuat peta...</div>}</div>;
}
