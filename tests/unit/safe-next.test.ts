/**
 * Unit tests for `?next=` redirect helper (lib/safe-next.ts).
 *
 * The `safeNextPath` helper guards the auth pages
 * (login, register, verify-otp) and the role entry
 * redirects (dispatcher, crew, admin/cities) against
 * open-redirect attacks. Anything that is not a same-origin
 * relative path must fall back to the supplied default.
 */

import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safe-next';

describe('safeNextPath', () => {
  const FALLBACK = '/home';

  it('returns the fallback for null, undefined, or empty', () => {
    expect(safeNextPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('   ', FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback for non-string input', () => {
    // @ts-expect-error — runtime guard
    expect(safeNextPath(123, FALLBACK)).toBe(FALLBACK);
    // @ts-expect-error — runtime guard
    expect(safeNextPath({}, FALLBACK)).toBe(FALLBACK);
  });

  it('accepts plain relative paths', () => {
    expect(safeNextPath('/report/location', FALLBACK)).toBe('/report/location');
    expect(safeNextPath('/admin/cities', FALLBACK)).toBe('/admin/cities');
    expect(safeNextPath('/dispatcher', FALLBACK)).toBe('/dispatcher');
  });

  it('accepts paths with query strings and hash fragments', () => {
    expect(
      safeNextPath('/report/location?step=photo&x=1', FALLBACK),
    ).toBe('/report/location?step=photo&x=1');
    expect(safeNextPath('/admin/cities#wards', FALLBACK)).toBe(
      '/admin/cities#wards',
    );
  });

  it('rejects absolute URLs (http://, https://, ftp://, javascript:)', () => {
    expect(
      safeNextPath('https://evil.com/phish', FALLBACK),
    ).toBe(FALLBACK);
    expect(
      safeNextPath('http://evil.com/phish', FALLBACK),
    ).toBe(FALLBACK);
    expect(
      safeNextPath('javascript:alert(1)', FALLBACK),
    ).toBe(FALLBACK);
    expect(safeNextPath('ftp://x', FALLBACK)).toBe(FALLBACK);
  });

  it('rejects protocol-relative paths (//evil.com)', () => {
    expect(safeNextPath('//evil.com/x', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('//evil.com', FALLBACK)).toBe(FALLBACK);
  });

  it('rejects backslash-prefixed paths (Windows-style)', () => {
    expect(safeNextPath('/\\evil.com', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('\\evil.com', FALLBACK)).toBe(FALLBACK);
  });

  it('rejects paths containing :// mid-string', () => {
    expect(
      safeNextPath('/foo/https://evil.com/x', FALLBACK),
    ).toBe(FALLBACK);
  });

  it('rejects the bare root path (/)', () => {
    expect(safeNextPath('/', FALLBACK)).toBe(FALLBACK);
  });

  it('rejects paths that do not start with /', () => {
    expect(safeNextPath('report/location', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('../etc/passwd', FALLBACK)).toBe(FALLBACK);
  });

  it('rejects paths with control characters', () => {
    expect(
      safeNextPath('/x\nLocation: evil', FALLBACK),
    ).toBe(FALLBACK);
    expect(
      safeNextPath('/x\r\nset-cookie: x=1', FALLBACK),
    ).toBe(FALLBACK);
  });

  it('trims leading/trailing whitespace before validating', () => {
    expect(
      safeNextPath('  /report/location  ', FALLBACK),
    ).toBe('/report/location');
  });

  it('uses a caller-provided fallback', () => {
    expect(safeNextPath('https://evil.com', '/admin/cities')).toBe(
      '/admin/cities',
    );
    expect(safeNextPath('/ok', '/admin/cities')).toBe('/ok');
  });
});
