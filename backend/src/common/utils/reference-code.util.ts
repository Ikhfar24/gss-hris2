export const REFERENCE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/i;

export function normalizeReferenceCode(value: string): string {
  return value.trim().toUpperCase();
}
