const DEVELOPMENT_ORIGIN = 'http://localhost:3000';

export function trustedOrigins(raw: string | undefined, environment = process.env.NODE_ENV): Set<string> {
  const values = raw?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  if (!values.length && environment === 'production') {
    throw new Error('CORS_ORIGIN wajib diatur pada production');
  }

  return new Set((values.length ? values : [DEVELOPMENT_ORIGIN]).map((value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) {
      throw new Error(`Origin tidak valid: ${value}`);
    }
    return url.origin;
  }));
}

export function isUnsafeMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function isTrustedBrowserOrigin(
  origin: string | undefined,
  allowed: Set<string>,
  environment = process.env.NODE_ENV,
): boolean {
  if (origin === undefined) return true;
  if (allowed.has(origin)) return true;

  // Izinkan development tunnels (ngrok, localtunnel) dan IP jaringan lokal saat development
  if (environment === 'development') {
    try {
      const url = new URL(origin);
      const host = url.hostname.toLowerCase();
      if (
        host.endsWith('.ngrok-free.dev') ||
        host.endsWith('.ngrok-free.app') ||
        host.endsWith('.ngrok.app') ||
        host.endsWith('.ngrok.io') ||
        host.endsWith('.loca.lt') ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}
