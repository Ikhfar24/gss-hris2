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

export function isTrustedBrowserOrigin(origin: string | undefined, allowed: Set<string>): boolean {
  return origin === undefined || allowed.has(origin);
}
