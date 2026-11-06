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
export { CategoryIcon, type CategoryIconProps } from './CategoryIcon';
export { ReportCard, type ReportCardProps } from './ReportCard';
export {
  FilterChipGroup,
  type FilterChipGroupProps,
  type FilterChipOption,
} from './FilterChipGroup';
export { StepIndicator, type StepIndicatorProps } from './StepIndicator';
export { ReportShell, type ReportShellProps } from './ReportShell';

/* --- Wave 1 — the design foundation primitives ---------------------------- */

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { IconButton, type IconButtonProps, type IconButtonVariant, type IconButtonSize } from './IconButton';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Avatar, initialsOf, type AvatarProps, type AvatarSize } from './Avatar';

export { Field, type FieldProps } from './Field';
export { Input, type InputProps, type InputSize } from './Input';
export { Select, type SelectProps, type SelectOption, type SelectSize } from './Select';
export { Textarea, type TextareaProps } from './Textarea';

export { Card, type CardProps } from './Card';
export { Panel, type PanelProps } from './Panel';
export { Toolbar, type ToolbarProps } from './Toolbar';
export { FilterBar, type FilterBarProps } from './FilterBar';
export {
  DataTable,
  sortRows,
  type DataTableProps,
  type DataTableColumn,
  type SortDirection,
} from './DataTable';

export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { LoadingState, type LoadingStateProps } from './LoadingState';

export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './Breadcrumb';
export { SideNav, type SideNavProps, type SideNavItem } from './SideNav';
export { Tabs, type TabsProps, type TabItem } from './Tabs';
export { Modal, type ModalProps } from './Modal';
export { Toast, type ToastProps, type ToastTone } from './Toast';
export { KpiRow, type KpiRowProps, type KpiItem, type KpiTrend } from './KpiRow';
export {
  MetricStrip,
  type MetricStripProps,
  type MetricFigure,
  type MetricTrend,
  type MetricTone,
} from './MetricStrip';
export { Timeline, type TimelineProps, type TimelineItem, type TimelineState } from './Timeline';

/* --- The chart kit -------------------------------------------------------- */

export {
  ChartFrame,
  StatCard,
  TrendLine,
  CategoryBar,
  SlaBullet,
  sortByValueDescending,
  clampToScale,
  type ChartFrameProps,
  type StatCardProps,
  type StatTrend,
  type StatTone,
  type TrendLineProps,
  type TrendLinePoint,
  type TrendLineSeries,
  type CategoryBarProps,
  type CategoryBarEntry,
  type SlaBulletProps,
  type SlaTone,
} from './charts';