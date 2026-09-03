'use client';

const DEVICE_KEY = 'papaiz_device_id';

/**
 * Opaque identifier for "this browser install", used for device binding
 * (§11.5). Persisted in localStorage so it survives reloads but NOT
 * reinstalls/other browsers — this binds a browser/app instance, not real
 * phone hardware, since the check-in surface is a web app. See README.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
