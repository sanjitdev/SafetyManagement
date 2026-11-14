/**
 * The chart kit.
 *
 * Five components, five jobs:
 *
 *   TrendLine   — a metric over time (tickets/day, adoption over weeks)
 *   CategoryBar — a ranked comparison (reports by category)
 *   StatusDonut — the mix of a whole (where the tickets are)
 *   SlaBullet   — one value against one target (resolution time vs SLA)
 *   StatCard    — one headline figure (live counters)
 *
 * Every chart ships a VISIBLE, SORTABLE data-table fallback and never
 * encodes a series by hue alone. The chart bodies that use Recharts
 * are loaded through `next/dynamic` with `ssr: false` so the server
 * components that host them stay server components.
 */

export { ChartFrame, type ChartFrameProps } from './ChartFrame';
export {
  StatCard,
  statCardDefaultLabel,
  type StatCardProps,
  type StatTrend,
  type StatTone,
} from './StatCard';
export {
  TrendLine,
  type TrendLineProps,
  type TrendLinePoint,
  type TrendLineSeries,
} from './TrendLine';
export {
  CategoryBar,
  sortByValueDescending,
  type CategoryBarProps,
  type CategoryBarEntry,
} from './CategoryBar';
export {
  StatusDonut,
  sortByStatusOrder,
  type StatusDonutProps,
  type StatusDonutEntry,
} from './StatusDonut';
export {
  SlaBullet,
  clampToScale,
  type SlaBulletProps,
  type SlaTone,
} from './SlaBullet';
