/**
 * /verify-otp/* layout — citizen OTP verification surface.
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function VerifyOtpLayout({ children }: { children: ReactNode }) {
  return <AppShell role="public">{children}</AppShell>;
}
