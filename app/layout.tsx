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
import { LanguageBoot } from './language-boot';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { getRequestLanguage } from '@/lib/i18n/server-language';

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
    // The favicon is the brand mark on a civic-blue tile, so it doubles
    // as the iOS home-screen icon without needing a separate asset.
    apple: '/favicon.svg',
  },
  // Per Phase 1: Bangla-first, English-secondary. The `<html lang>` attribute
  // is deliberately NOT rendered here — see the note on the `<html>` element
  // below. `app/language-boot.tsx` owns it instead.
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
  // The language the SERVER renders this page in. It comes from the
  // `cityfix_lang` cookie, falling back to the Bangla-first default for
  // a visitor with no stored preference and for the no-JS case.
  //
  // WHY THE SAME COOKIE THE CLIENT READS
  // ------------------------------------
  // `useLanguage()` is a `'use client'` hook, so Next.js server-renders
  // it too. Its initialiser runs on the server, where localStorage does
  // not exist. If the server rendered a different language from the one
  // the client renders, React would report "Text content does not
  // match server-rendered HTML" on every translated string, discard the
  // server HTML, and re-render the whole tree client-side.
  //
  // Both sides read the SAME `cityfix_lang` cookie, so they agree from
  // the first byte.
  //
  // Note that this does NOT need to be awaited: `cookies()` is
  // synchronous in Next 14. The lazy read inside the request-scoped
  // store handles the child render, which happens BEFORE this layout
  // body runs (a layout's `children` is a pre-rendered element).
  const lang = getRequestLanguage();

  return (
    // React's hydration treats a server-rendered attribute on `<html>`
    // as authoritative and writes it back over whatever the DOM holds,
    // so `app/language-boot.tsx` re-asserts the attribute after
    // hydration undoes that reconciliation.
    <html lang={lang} suppressHydrationWarning>
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
        <LanguageBoot />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
