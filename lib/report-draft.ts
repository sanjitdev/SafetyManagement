/**
 * Report draft state (lib/report-draft.ts).
 *
 * The report flow is multi-step (location → photo → category → note → submit
 * → confirmation). Per WO-001 spec, drafts persist across the steps but
 * are not server-side; the citizen moves linearly through the pages.
 *
 * v1 carries the draft in `sessionStorage` so a tab refresh does not lose
 * the in-progress report. When the citizen lands on /report/:id/submitted,
 * the draft is cleared.
 *
 * v1.1 may add server-side draft persistence (IndexedDB-backed).
 */

import { DHAKA_CENTER } from './geo/constants';

export interface ReportDraft {
  cityId: string;
  wardId: string;
  locationLat: number;
  locationLng: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  categoryId: string | null;
  photoUrls: string[];
  note: string;
  step: 'location' | 'photo' | 'category' | 'note' | 'summary' | 'submitted';
}

const STORAGE_KEY = 'cityfix.reportDraft.v1';

export function emptyDraft(cityId: string, wardId: string): ReportDraft {
  return {
    cityId,
    wardId,
    locationLat: DHAKA_CENTER.lat,
    locationLng: DHAKA_CENTER.lng,
    locationLabel: 'Mirpur, ঢাকা',
    locationLabelBn: 'মিরপুর, ঢাকা',
    categoryId: null,
    photoUrls: [],
    note: '',
    step: 'location',
  };
}

export function loadDraft(): ReportDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReportDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: ReportDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
