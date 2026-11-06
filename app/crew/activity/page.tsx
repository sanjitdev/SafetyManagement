/**
 * Field crew — the full activity log (/crew/activity).
 *
 * The crew portal's design reference
 * (`ui-design/Crew Portal Dashboard.png`) lists "Activity Log" as
 * a sidebar item beside "My Jobs". The dashboard shows the three
 * most recent events; this route shows the whole timeline.
 *
 * Data: the crew's ticket history from
 * `GET /api/v1/crew/tickets?scope=history` — the actionable list
 * cannot produce a trail event for a finished job (a resolved
 * ticket is not in it), so the log reads the history scope.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { useSession } from '@/components/SessionProvider';
import { ticketReference } from '@/lib/crew/ticket-reference';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface TrailEntry {
  toStatus: TicketStatus;
  actorLabel: string;
  note: string | null;
  timestamp: string;
}

interface HistoryTicket {
  id: string;
  status: TicketStatus;
  createdAt: string;
  resolvedAt?: string | null;
  trail?: TrailEntry[];
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === 'bn' ? 'এইমাত্র' : 'just now';
  if (minutes < 60) {
    return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

function shortTicketId(id: string): string {
  return ticketReference(id);
}

export default function CrewActivityPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [tickets, setTickets] = useState<HistoryTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The shared session — one request for the whole page, shared by the
  // header, the sidebar, the user menu and this page.
  const { authenticated } = useSession();

  useEffect(() => {
    function syncLang() {
      try {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'en' || stored === 'bn') setLang(stored);
      } catch {
        // ignore
      }
    }
    syncLang();
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
    };
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(
        '/api/v1/crew/tickets?scope=history&limit=100',
        { credentials: 'include' },
      );
      if (!res.ok) {
        setError('crew.list.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { tickets: HistoryTicket[] };
      setTickets(data.tickets ?? []);
      setError(null);
      setLoading(false);
    } catch {
      setError('crew.list.error');
      setLoading(false);
    }
  }, []);

  // Polling starts only once the session has resolved.
  //
  // Fetching unconditionally would double the request count under
  // React 18 StrictMode, which mounts every component twice in
  // development: the first mount fires the request, the cleanup
  // cancels the timer, the second mount fires it again. Gating on
  // the session — which is still `null` during the first mount —
  // means only the second mount issues the request.
  useEffect(() => {
    if (authenticated === null) return; // still resolving
    void fetchTickets();
    const timer = window.setInterval(() => {
      void fetchTickets();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [authenticated, fetchTickets]);

  const events = useMemo(() => {
    const list: Array<{
      id: string;
      text: string;
      at: string;
      tone: 'done' | 'active' | 'plain';
    }> = [];
    for (const tk of tickets) {
      for (const entry of tk.trail ?? []) {
        const shortId = shortTicketId(tk.id);
        let text: string | null = null;
        let tone: 'done' | 'active' | 'plain' = 'plain';
        if (entry.toStatus === 'resolved') {
          text = t('crew.dashboard.activity.resolved', { id: shortId }, lang);
          tone = 'done';
        } else if (entry.toStatus === 'in_progress') {
          text = t('crew.dashboard.activity.started', { id: shortId }, lang);
          tone = 'active';
        } else if (entry.toStatus === 'routed') {
          text = t('crew.dashboard.activity.assigned', { id: shortId }, lang);
        } else if (entry.toStatus === 'submitted') {
          text = t('crew.dashboard.activity.routed', { id: shortId }, lang);
        }
        if (!text) continue;
        list.push({
          id: `${tk.id}:${entry.toStatus}:${entry.timestamp}`,
          text,
          at: entry.timestamp,
          tone,
        });
      }
    }
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list;
    // `lang` is a dependency because the event TEXT is localised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, lang]);

  return (
    <div className="crew-page" data-testid="crew-activity-page">
      <div className="crew-dashboard-heading">
        <div>
          <h1 lang={lang}>{t('shell.nav.activity_log', null, lang)}</h1>
          <p lang={lang}>{t('crew.dashboard.activity_title', null, lang)}</p>
        </div>
        <div style={{ marginInlineStart: 'auto' }}>
          <Link href="/crew" className="crew-detail-link" lang={lang}>
            {t('crew.dashboard.jobs_title', null, lang)} →
          </Link>
        </div>
      </div>

      <section className="crew-panel">
        {loading ? (
          <div className="crew-panel-empty">
            <p lang={lang} style={{ margin: 0 }}>
              …
            </p>
          </div>
        ) : error ? (
          <p
            role="alert"
            lang={lang}
            style={{
              padding: 'var(--space-6)',
              color: 'var(--color-danger, #c92a2a)',
              textAlign: 'center',
            }}
          >
            {t('crew.list.error', null, lang)}
          </p>
        ) : events.length === 0 ? (
          <div className="crew-panel-empty">
            <p lang={lang} style={{ margin: 0 }}>
              {t('crew.dashboard.activity_empty', null, lang)}
            </p>
          </div>
        ) : (
          <ul className="crew-activity-list">
            {events.map((item) => (
              <li
                key={item.id}
                className={`crew-activity-item${
                  item.tone === 'done'
                    ? ' is-done'
                    : item.tone === 'active'
                      ? ' is-active'
                      : ''
                }`}
              >
                <span aria-hidden>
                  {item.tone === 'done'
                    ? '✓'
                    : item.tone === 'active'
                      ? '◐'
                      : '●'}
                </span>
                <p lang={lang}>{item.text}</p>
                <time dateTime={item.at} lang={lang}>
                  {formatAge(item.at, lang)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
