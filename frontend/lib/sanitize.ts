import DOMPurify from 'dompurify';

/**
 * Sanitize untrusted HTML string for safe rendering.
 * Use this if you ever need to render dynamic HTML content.
 * Currently the app uses zero dangerouslySetInnerHTML — keep it that way.
 * This utility exists as defense-in-depth for future needs.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}

export function sanitizePlainText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
