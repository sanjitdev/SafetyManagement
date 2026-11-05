/**
 * /report/* layout — top bar + step indicator + content slot.
 *
 * Per Phase B (2026-10-04) web re-skin + Bolt 006-002 (S-003.2)
 * shell standardization + Bolt 006-004 unified app shell:
 *   - Global `<AppHeader>` is rendered by the root AppShell chain
 *     (inherited from this layout's `AppShell` wrap). This layout
 *     no longer renders its own sticky top bar.
 *   - The 5-dot step indicator strip is now passed as `subHeader`
 *     to AppShell, so it lives *just below* the global header
 *     (not above it) and scrolls with the page content.
 *
 * The current step is derived from `usePathname()`. The mapping
 * is a small static table (STEP_BY_PATH); anything outside the
 * 5 known paths falls back to step 1.
 *
 * The step pages render their own content; this layout only
 * provides the persistent chrome. The sticky bottom action bar
 * is rendered by the step page itself (each step has different
 * action text + target).
 */

'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { type Language } from '@/lib/i18n/keys';
import { StepIndicator } from '@/components/ui';

const STEP_BY_PATH: Record<string, number> = {
  '/report/location': 1,
  '/report/category': 2,
  '/report/photo': 3,
  '/report/note': 4,
  '/report/summary': 5,
};

const STEP_LABELS_BN = ['অবস্থান', 'বিভাগ', 'ছবি', 'নোট', 'সারাংশ'];
const STEP_LABELS_EN = ['Location', 'Category', 'Photo', 'Note', 'Summary'];
const LANG_KEY = 'cityfix.preferred_language.v1';

function resolveCurrentStep(pathname: string | null): number {
  if (!pathname) return 1;
  const clean = pathname.split('?')[0]?.replace(/\/$/, '') ?? '';
  return STEP_BY_PATH[clean] ?? 1;
}

export default function ReportLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>('bn');
  useEffect(() => {
    const syncLanguage = (event?: Event) => {
      const next = event instanceof CustomEvent ? event.detail : window.localStorage.getItem(LANG_KEY);
      if (next === 'bn' || next === 'en') setLang(next);
    };
    syncLanguage();
    window.addEventListener('cityfix:language-updated', syncLanguage);
    return () => window.removeEventListener('cityfix:language-updated', syncLanguage);
  }, []);
  const currentStep = resolveCurrentStep(pathname);
  const stepLabels = lang === 'bn' ? STEP_LABELS_BN : STEP_LABELS_EN;

  return (
    <AppShell
      role="citizen"
      subHeader={
        <div
          className="report-layout-step-labels"
          style={{
            padding: 'var(--space-3) var(--space-5)',
            background: 'var(--color-surface-card)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <StepIndicator
            current={currentStep}
            total={5}
            labels={stepLabels}
            lang={lang}
            className="report-step-indicator"
          />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
