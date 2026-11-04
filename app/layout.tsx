/**
 * Root layout — CityFix web app.
 *
 * Per tech-audit.md §1: Next.js 14 App Router. Single root layout provides
 * the html shell, font preconnect, and the global stylesheet. Per-route
 * layouts live alongside each page in app/<route>/layout.tsx (created when
 * persona WOs ship their pages).
 *
 * Per Phase B (2026-10-04): the app is web-first; Rashid's pages retain
 * a phone-width fallback (390 × 844) per WO-003.
 */

import type { Metadata } from 'next';
import './globals.css';
import { AppearanceBoot } from './appearance-boot';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

export const metadata: Metadata = {
  title: {
    default: 'CityFix',
    template: '%s · CityFix',
  },
  description:
    'CityFix — citizen-powered city issue reporting and tracking for Bangladeshi city corporations.',
  applicationName: 'CityFix',
  authors: [{ name: 'CityFix' }],
  generator: 'Next.js',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  // Per Phase 1: Bangla-first, English-secondary. The lang attribute below
  // declares the default; pages with explicit Bangla content set lang="bn".
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1220', // matches the default CityFix dark canvas
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppearanceBoot />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
