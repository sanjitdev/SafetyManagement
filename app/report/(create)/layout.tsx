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
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { useLanguage } from '@/components/useLanguage';
import { StepIndicator } from '@/components/ui';
import { t } from '@/lib/i18n/keys';

/**
 * The locked 5-step order (mockups 14, UX spec 1.8/1.9/1.10/1.11):
 *
 *   1 Location → 2 Photo → 3 Category → 4 Note → 5 Summary
 *
 * This table is the single place the rail order is declared, and the
 * step pages' navigation follows the same order: each step's
 * "Continue" pushes the next path in this list.
 *
 * Before Intent 009 the CODE navigated Location → Category → Photo
 * while the RAIL, the `StepIndicator` primitive's own docblock, the
 * UX specs (1.7 "Step 1 of 4: Location", 1.8 "Step 2 of 4: Photo",
 * 1.9 "Step 3 of 4: Category") and mockup 14 all said Photo is
 * step 2 and Category is step 3. The navigation was the outlier and
 * has been corrected to match the contract.
 */
const STEP_BY_PATH: Record<string, number> = {
  '/report/location': 1,
  '/report/photo': 2,
  '/report/category': 3,
  '/report/note': 4,
  '/report/summary': 5,
};

/**
 * The i18n key for each step's rail label. The rail labels are
 * resolved through the registry (rather than a module-level array
 * of literals) so the copy lives in ONE place — `lib/i18n/keys.ts`
 * — and the `check:i18n` script can verify every step label.
 */
const STEP_LABEL_KEYS = [
  'report.step.1',
  'report.step.2',
  'report.step.3',
  'report.step.4',
  'report.step.5',
] as const;

/**
 * The i18n key for each step's progress sentence. The sentence
 * under the rail reads "ধাপ ২ / ৫ — ছবি যোগ করুন" (mockup 14), so
 * the position is never a colour-only cue.
 */
const STEP_SUBTITLE_KEYS = [
  'report.step.subtitle.location',
  'report.step.subtitle.photo',
  'report.step.subtitle.category',
  'report.step.subtitle.note',
  'report.step.subtitle.summary',
] as const;

function resolveCurrentStep(pathname: string | null): number {
  if (!pathname) return 1;
  const clean = pathname.split('?')[0]?.replace(/\/$/, '') ?? '';
  return STEP_BY_PATH[clean] ?? 1;
}

export default function ReportLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The shared hook owns the language, so the step labels follow the
  // same preference as the header and the step pages themselves.
  const { lang } = useLanguage();
  const currentStep = resolveCurrentStep(pathname);
  const stepLabels = STEP_LABEL_KEYS.map((key) => t(key, null, lang));
  const stepSubtitle = t(STEP_SUBTITLE_KEYS[currentStep - 1], null, lang);

  return (
    <AppShell
      role="citizen"
      variant="flow"
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
            data-testid="report-step-indicator"
          />
          {/* The progress sentence under the rail. The mockup puts
              it there so the position is never a colour-only cue —
              the digits and the words carry it. */}
          <p
            lang={lang}
            data-testid="report-step-progress"
            style={{
              margin: 'var(--space-2) 0 0',
              textAlign: 'center',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {t(
              'report.step.progress',
              {
                current: currentStep,
                total: 5,
                label: stepSubtitle,
              },
              lang,
            )}
          </p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
