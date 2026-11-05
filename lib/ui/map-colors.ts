import type { CityActivityStatus } from '@/components/CityActivityMap';

/**
 * Map tiles are light OpenStreetMap imagery in either app theme. These
 * colors mirror the contrast-checked light status tokens so map pins and
 * legends keep the same meaning across every role dashboard.
 */
export const MAP_STATUS_COLORS: Record<CityActivityStatus, string> = {
  submitted: '#5C6C83',
  routed: '#1E40AF',
  in_progress: '#B45309',
  resolved: '#15803D',
  closed: '#5C6C83',
  cancelled: '#5C6C83',
};

/** Civic blue boundary / cluster color, matching --color-primary. */
export const MAP_PRIMARY_COLOR = '#1E40AF';
