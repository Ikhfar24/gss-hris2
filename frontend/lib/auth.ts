'use client';

const USER_COOKIE = 'papaiz_user';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
}

// Cookies (not localStorage) so the Next.js middleware can read auth state
// on the server before rendering protected routes.
function setCookie(name: string, value: string, days = 1) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function saveSession(user: SessionUser) {
  setCookie(USER_COOKIE, JSON.stringify(user));
}

export function getToken(): string | null {
  // Access tokens are HttpOnly cookies and intentionally unavailable to JS.
  return null;
}

export function clearSession() {
  deleteCookie(USER_COOKIE);
}
