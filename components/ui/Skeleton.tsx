import type { CSSProperties, ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export function SkeletonBlock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`cityfix-skeleton${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}

export function SkeletonStatus({
  lang,
  children,
  className,
  'data-testid': testId,
}: {
  lang: Language;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-label={t('ui.loading.label', null, lang)} data-testid={testId} className={className}>
      {children}
    </div>
  );
}

export function TicketDetailSkeleton({ lang, testId }: { lang: Language; testId?: string }) {
  return (
    <SkeletonStatus lang={lang} className="ticket-detail-skeleton" data-testid={testId}>
      <div className="ticket-detail-skeleton-heading">
        <SkeletonBlock style={{ width: 110, height: 14 }} />
        <SkeletonBlock style={{ width: '42%', height: 24 }} />
        <SkeletonBlock style={{ width: 90, height: 26, borderRadius: 999 }} />
      </div>
      <div className="ticket-detail-skeleton-grid">
        <div className="ticket-detail-skeleton-main">
          <SkeletonBlock style={{ width: '100%', height: 220, borderRadius: 'var(--radius-card)' }} />
          <div className="ticket-detail-skeleton-panel">
            <SkeletonBlock style={{ width: '36%', height: 17 }} />
            <SkeletonBlock style={{ width: '92%', height: 12 }} />
            <SkeletonBlock style={{ width: '82%', height: 12 }} />
            <SkeletonBlock style={{ width: '66%', height: 12 }} />
          </div>
        </div>
        <div className="ticket-detail-skeleton-side">
          <div className="ticket-detail-skeleton-panel">
            <SkeletonBlock style={{ width: '48%', height: 16 }} />
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} style={{ width: `${74 + item % 2 * 12}%`, height: 12 }} />)}
          </div>
          <div className="ticket-detail-skeleton-panel">
            <SkeletonBlock style={{ width: '54%', height: 16 }} />
            <SkeletonBlock style={{ width: '100%', height: 80, borderRadius: 'var(--radius-md)' }} />
            <SkeletonBlock style={{ width: '44%', height: 38, borderRadius: 'var(--radius-md)' }} />
          </div>
        </div>
      </div>
    </SkeletonStatus>
  );
}

export function AdminPageSkeleton({ lang, testId }: { lang: Language; testId?: string }) {
  return (
    <SkeletonStatus lang={lang} className="admin-page-skeleton" data-testid={testId}>
      <div className="admin-page-skeleton-heading">
        <SkeletonBlock style={{ width: 230, height: 24 }} />
        <SkeletonBlock style={{ width: 124, height: 40, borderRadius: 'var(--radius-md)' }} />
      </div>
      <div className="admin-page-skeleton-cards">
        {[0, 1, 2].map((item) => <div key={item} className="admin-page-skeleton-card"><SkeletonBlock style={{ width: '40%', height: 14 }} /><SkeletonBlock style={{ width: '76%', height: 16 }} /><SkeletonBlock style={{ width: '58%', height: 12 }} /></div>)}
      </div>
      <div className="admin-page-skeleton-panel">
        {[0, 1, 2, 3, 4].map((item) => <div key={item}><SkeletonBlock style={{ width: `${58 + item % 3 * 10}%`, height: 14 }} /><SkeletonBlock style={{ width: 74, height: 14 }} /></div>)}
      </div>
    </SkeletonStatus>
  );
}

export function ReportFlowSkeleton({ lang, testId }: { lang: Language; testId?: string }) {
  return (
    <SkeletonStatus lang={lang} className="report-flow-skeleton" data-testid={testId}>
      <div className="report-flow-skeleton-main">
        <SkeletonBlock style={{ width: '48%', height: 25 }} />
        <SkeletonBlock style={{ width: '78%', height: 14 }} />
        <div className="report-flow-skeleton-options">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item}><SkeletonBlock style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', flex: '0 0 auto' }} /><div style={{ display: 'grid', gap: 8, flex: 1 }}><SkeletonBlock style={{ width: `${58 + item % 3 * 10}%`, height: 14 }} /><SkeletonBlock style={{ width: '78%', height: 11 }} /></div></div>)}
        </div>
        <div className="report-flow-skeleton-footer"><SkeletonBlock style={{ width: 104, height: 42, borderRadius: 'var(--radius-md)' }} /><SkeletonBlock style={{ width: 136, height: 42, borderRadius: 'var(--radius-md)' }} /></div>
      </div>
      <div className="report-flow-skeleton-aside"><SkeletonBlock style={{ width: '46%', height: 16 }} /><SkeletonBlock style={{ width: '100%', height: 160, borderRadius: 'var(--radius-md)' }} /><SkeletonBlock style={{ width: '82%', height: 13 }} /><SkeletonBlock style={{ width: '62%', height: 13 }} /></div>
    </SkeletonStatus>
  );
}
