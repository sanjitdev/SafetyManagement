/**
 * OTP (one-time password) helpers (lib/auth/otp.ts).
 *
 * PLAT-REQ-002 acceptance: SMS-based, ≤ 5 min TTL, single-use, retry-cap.
 *
 * We store the HASH of the OTP, not the plaintext (same posture as passwords).
 * The library `otpauth` handles TOTP generation/verification — but for SMS we
 * generate a 6-digit random code and store its argon2 hash, then verify by
 * re-hashing the user-supplied code and constant-time comparing.
 */

import { hashPassword, verifyPassword } from './password';

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

export function generateOtp(): string {
  // Generate a 6-digit code (leading zeros allowed).
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(code: string): Promise<string> {
  // Reuse argon2; the short length is fine — argon2 handles any string.
  return hashPassword(code);
}

export async function verifyOtp(
  hash: string,
  candidate: string,
): Promise<boolean> {
  return verifyPassword(hash, candidate);
}