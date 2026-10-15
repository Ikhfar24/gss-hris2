'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Branding {
  companyName: string;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
}

const fallback: Branding = { companyName: 'Papaiz', appName: 'Papaiz HR', logoUrl: null, faviconUrl: null, primaryColor: '#0F3151' };
const BrandingContext = createContext<Branding>(fallback);

function safeColor(value: unknown) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback.primaryColor;
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map((channel) => Number.parseInt(channel, 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return 1.05 / (luminance + 0.05) >= 4.5 ? value : fallback.primaryColor;
}

function colorChannels(value: string) {
  return [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map((channel) => Number.parseInt(channel, 16)).join(' ');
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return /^\/(?!\/)[A-Za-z0-9._~/-]*$/.test(value) ? value : null;
}

function normalize(value: unknown): Branding {
  if (!value || typeof value !== 'object') return fallback;
  const item = value as Record<string, unknown>;
  return {
    companyName: typeof item.companyName === 'string' && item.companyName.trim() ? item.companyName : fallback.companyName,
    appName: typeof item.appName === 'string' && item.appName.trim() ? item.appName : fallback.appName,
    logoUrl: safeUrl(item.logoUrl),
    faviconUrl: safeUrl(item.faviconUrl),
    primaryColor: safeColor(item.primaryColor),
  };
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState(fallback);

  useEffect(() => {
    let active = true;
    const load = () => apiFetch<unknown>('/branding').then((value) => { if (active) setBranding(normalize(value)); }).catch(() => undefined);
    void load();
    window.addEventListener('branding-updated', load);
    return () => { active = false; window.removeEventListener('branding-updated', load); };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-color', branding.primaryColor);
    document.documentElement.style.setProperty('--brand-rgb', colorChannels(branding.primaryColor));
    document.title = branding.appName;
    let favicon = document.querySelector<HTMLLinkElement>('link[data-dynamic-favicon]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.dataset.dynamicFavicon = 'true';
      document.head.appendChild(favicon);
    }
    favicon.href = branding.faviconUrl ?? '/favicon.ico';
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() { return useContext(BrandingContext); }
