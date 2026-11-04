/**
 * /verify-otp/* layout — citizen OTP verification surface.
 */

import type { ReactNode } from 'react';

export default function VerifyOtpLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-app-shell
      data-shell-role="public"
      style={{
        minHeight: '100dvh',
        background: 'var(--color-surface-page)',
        color: 'var(--color-ink)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}
