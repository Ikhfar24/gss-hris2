const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  token?: string | null;
  _isRetry?: boolean;
}

let refreshPromise: Promise<void> | null = null;

async function requestRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: res.statusText }));
          throw new ApiError(res.status, payload.message ?? 'Gagal memperbarui token');
        }
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function downloadFile(path: string, token: string | null, fallbackName: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, payload.message ?? 'Gagal mengunduh file');
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="(.+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function protectedMediaUrl(path: string): string {
  if (!path.startsWith('/api/v1/')) return path;
  return `${API_URL}${path.slice('/api/v1'.length)}`;
}

export async function uploadFile<T>(path: string, file: File, token?: string | null): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, payload.message ?? 'Gagal mengunggah file');
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && !opts._isRetry && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/login')) {
      const payload = await res.json().catch(() => ({ message: res.statusText }));
      const originalError = new ApiError(res.status, payload.message ?? 'Tidak terautentikasi');
      try {
        await requestRefresh();
        return await apiFetch<T>(path, { ...opts, _isRetry: true });
      } catch {
        throw originalError;
      }
    }

    if (res.status === 429) {
      throw new ApiError(429, 'Terlalu banyak permintaan. Mohon tunggu beberapa saat lalu coba lagi.');
    }
    const payload = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, payload.message ?? 'Terjadi kesalahan');
  }

  // 204 No Content etc.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
