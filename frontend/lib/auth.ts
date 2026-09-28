'use client';

const USER_COOKIE = 'papaiz_user';

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function getToken(): string | null {
  // Access tokens are HttpOnly cookies and intentionally unavailable to JS.
  return null;
}

export function clearSession() {
  deleteCookie(USER_COOKIE);
  if (typeof localStorage !== 'undefined') {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('papaiz_attendance_queue:')) localStorage.removeItem(key);
    }
  }
}
