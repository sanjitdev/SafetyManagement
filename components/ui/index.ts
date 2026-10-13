/**
 * components/ui — pure-presentational primitives.
 *
 * Barrel re-export. Consumers should import from
 * `@/components/ui` rather than reaching into individual
 * files, so the public surface of the primitive library is
 * visible at a glance.
 *
 * Adding a new primitive:
 *   1. Implement the component in this directory.
 *   2. Add a `tests/unit/components/<Name>.test.tsx` covering
 *      happy path + at least two error/edge cases (per
 *      `aidlc/spaces/default/memory/phases/construction.md`
 *      testing standards).
 *   3. Re-export below.
 *   4. Add the i18n keys it needs to `lib/i18n/keys.ts`.
 *
 * Primitives must:
 *   - Take only props (no fetching, no `useEffect` unless
 *     the primitive is intrinsically client-driven like
 *     `FilterChipGroup`).
 *   - Never import from `app/` routes.
 *   - Use only design tokens (`var(--color-*)`, `var(--space-*)`,
 *     `var(--text-*)`, `var(--radius-*)`, `var(--duration-*)`,
 *     `var(--ease-*)`) — no hard-coded hex / px values.
 *   - Be locale-aware via a `lang` prop.
 */

export { StatusPill, type StatusPillProps, type StatusKey } from './StatusPill';
export { ReportCard, type ReportCardProps } from './ReportCard';
export {
  FilterChipGroup,
  type FilterChipGroupProps,
  type FilterChipOption,
} from './FilterChipGroup';
export { StepIndicator, type StepIndicatorProps } from './StepIndicator';
export { ReportShell, type ReportShellProps } from './ReportShell';