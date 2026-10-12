/**
 * `?next=` redirect helper (lib/safe-next.ts).
 *
 * Auth pages (login, register, verify-otp) accept an optional
 * `?next=/some/path` so a deep link can resume after auth
 * (e.g. /report/location when a public visitor taps "Report
 * what you see"). The destination MUST be a same-origin
 * relative path; anything else (absolute URL, protocol-relative
 * `//evil.com`, javascript:, etc.) is rejected and we fall back
 * to the supplied default.
 *
 * Rules:
 *   - Reject empty / non-string.
 *   - Must start with `/`.
 *   - Must NOT start with `//` (protocol-relative).
 *   - Must NOT start with `/\` (Windows-style backslash).
 *   - Must not contain `://` (mid-string, blocks pseudo-protocol tricks
 *     like `/foo/https://evil.com/x`).
 *   - Must not be just `/`.
 *
 * Returns the cleaned path (a leading-and-trailing-slash form) or
 * `fallback` if the input is unsafe.
 */

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  if (trimmed.startsWith('/\\')) return fallback;
  if (trimmed.includes('://')) return fallback;
  // Reject raw `\` and control characters.
  if (/[\\\x00-\x1f]/.test(trimmed)) return fallback;
  if (trimmed === '/') return fallback;
  return trimmed;
}
