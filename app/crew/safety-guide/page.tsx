/**
 * Field crew — the safety guide (/crew/safety-guide).
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * The crew dashboard's "Field tips" card carried a "View safety
 * guide" link from the day the three-panel console shipped
 * (commit 64ec228) — and the link pointed at `/crew/safety-guide`,
 * a route that did not exist. Clicking it in the demo produced a
 * 404.
 *
 * The card is not decoration: it promises the crew a safety guide,
 * and a field crew working a live street at night genuinely needs
 * one. So the guide is a real page here, with the guidance a
 * municipal field team needs before starting a job — the same rules
 * the dispatch and crew surfaces already assume (PPE, traffic
 * control, working at height, electrical isolation, and what to do
 * when a citizen stops you in the street).
 *
 * WHY IT IS STATIC
 * ----------------
 * The content is SAFETY GUIDANCE, not city configuration — the
 * same advice applies to every ward. It deliberately does NOT come
 * from the API: the alternative would be a city-config surface
 * with nothing to configure, which is a worse promise than a
 * static page that is always right.
 *
 * The copy is bilingual (Bangla first, matching the rest of the
 * crew surface) and lives in `lib/i18n/keys.ts` so the
 * `check:i18n` script can verify it.
 */

'use client';

import { useLanguage } from '@/components/useLanguage';
import { t } from '@/lib/i18n/keys';
import { ICONS } from '@/lib/ui/icon-map';

interface GuideItem {
  icon: keyof typeof ICONS;
  titleKey: string;
  bodyKey: string;
}

/**
 * The guide sections, in the order a crew meets them: before you
 * leave, on arrival, during the job, and when you finish.
 */
const SECTIONS: Array<{ id: string; titleKey: string; items: GuideItem[] }> = [
  {
    id: 'before',
    titleKey: 'crew.safety.before.title',
    items: [
      {
        icon: 'security',
        titleKey: 'crew.safety.before.ppe.title',
        bodyKey: 'crew.safety.before.ppe.body',
      },
      {
        icon: 'note',
        titleKey: 'crew.safety.before.checklist.title',
        bodyKey: 'crew.safety.before.checklist.body',
      },
      {
        icon: 'info',
        titleKey: 'crew.safety.before.weather.title',
        bodyKey: 'crew.safety.before.weather.body',
      },
    ],
  },
  {
    id: 'on-site',
    titleKey: 'crew.safety.onsite.title',
    items: [
      {
        icon: 'mapPin',
        titleKey: 'crew.safety.onsite.traffic.title',
        bodyKey: 'crew.safety.onsite.traffic.body',
      },
      {
        icon: 'users',
        titleKey: 'crew.safety.onsite.citizen.title',
        bodyKey: 'crew.safety.onsite.citizen.body',
      },
      {
        icon: 'security',
        titleKey: 'crew.safety.onsite.electrical.title',
        bodyKey: 'crew.safety.onsite.electrical.body',
      },
    ],
  },
  {
    id: 'during',
    titleKey: 'crew.safety.during.title',
    items: [
      {
        icon: 'image',
        titleKey: 'crew.safety.during.photos.title',
        bodyKey: 'crew.safety.during.photos.body',
      },
      {
        icon: 'users',
        titleKey: 'crew.safety.during.pair.title',
        bodyKey: 'crew.safety.during.pair.body',
      },
      {
        icon: 'info',
        titleKey: 'crew.safety.during.escalate.title',
        bodyKey: 'crew.safety.during.escalate.body',
      },
    ],
  },
  {
    id: 'after',
    titleKey: 'crew.safety.after.title',
    items: [
      {
        icon: 'check',
        titleKey: 'crew.safety.after.finish.title',
        bodyKey: 'crew.safety.after.finish.body',
      },
      {
        icon: 'note',
        titleKey: 'crew.safety.after.report.title',
        bodyKey: 'crew.safety.after.report.body',
      },
    ],
  },
];

export default function CrewSafetyGuidePage() {
  const { lang } = useLanguage();
  const LANG = lang;

  return (
    <div className="crew-page crew-guide-page">
      <header className="crew-guide-header">
        <div>
          <h1 className="crew-guide-title" lang={LANG}>
            {t('crew.safety.title', null, LANG)}
          </h1>
          <p className="crew-guide-subtitle" lang={LANG}>
            {t('crew.safety.subtitle', null, LANG)}
          </p>
        </div>
        <a className="crew-guide-back" href="/crew" lang={LANG}>
          <ICONS.forward.icon
            size={16}
            weight={ICONS.forward.weight}
            style={{ transform: 'rotate(180deg)' }}
            aria-hidden
          />
          {t('crew.safety.back', null, LANG)}
        </a>
      </header>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="crew-panel crew-guide-section"
          aria-labelledby={`crew-guide-${section.id}`}
        >
          <div className="crew-panel-heading">
            <h2 id={`crew-guide-${section.id}`} lang={LANG}>
              {t(section.titleKey, null, LANG)}
            </h2>
          </div>
          <ul className="crew-guide-list">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon].icon;
              return (
                <li key={item.titleKey} className="crew-guide-item">
                  <span className="crew-guide-icon" aria-hidden>
                    <Icon size={18} weight={ICONS[item.icon].weight} />
                  </span>
                  <div className="crew-guide-item-body">
                    <h3 lang={LANG}>{t(item.titleKey, null, LANG)}</h3>
                    <p lang={LANG}>{t(item.bodyKey, null, LANG)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="crew-guide-footer">
        <p lang={LANG}>
          <ICONS.info.icon
            size={16}
            weight={ICONS.info.weight}
            style={{ verticalAlign: '-3px', marginRight: 6 }}
            aria-hidden
          />
          {t('crew.safety.footer', null, LANG)}
        </p>
      </footer>
    </div>
  );
}
