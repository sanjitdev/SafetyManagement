/**
 * 1.8 Report — Photo Capture (mockup 14)
 *
 * Per UX Review revision #6: multi-photo capture with a default cap
 * of 3, narrow-category cap of 2, mandatory minimum of 1. For the
 * dev demo we read files via the FileReader API into base64 data
 * URLs (no S3/MinIO yet — that lands with the production photo
 * pipeline).
 *
 * INTENT 009 / BOLT 009-004 (Story 010) — re-composed to
 * `design-artifacts/D-Design-System/01-Visual-Design/mockups/14-report-shell.html`:
 *
 * NOTE (2026-11-13): the page-per-page mockups were replaced by the four
 * role dashboards, so `14-report-shell.html` no longer exists. The
 * composition described below is retained here as the record of the
 * contract this page was built against.
 *
 *   - the photo cap indicator is a pill that reads "1 / 3 ছবি"
 *     (ASCII digits — see `report.photo.counter` in the i18n
 *     registry and the note in `lib/i18n/keys.ts` about why the
 *     digits are NOT Bengali numerals);
 *   - the photos sit in a three-cell grid, one cell per slot, with
 *     the filled cell showing the photo and the empty cells offering
 *     "add photo";
 *   - the privacy note is a hint card under the grid;
 *   - the location the citizen already picked is repeated in a
 *     reminder card, with a link back to step 1.
 *
 * This step is step 2 of 5 in the LOCKED flow order
 * (1 Location → 2 Photo → 3 Category → 4 Note → 5 Summary).
 * The route path is `/report/photo` but the rail order is declared
 * in `app/report/(create)/layout.tsx`.
 *
 * Every interactive element comes from `components/ui/` — there is
 * no hand-rolled `<button>` on this page.
 *
 * Server component shell; client component for the file input.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { Button, IconButton } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';
import { loadDraft, saveDraft, type ReportDraftPhotoBlob } from '@/lib/report-draft';
import { derivePhotoCap, type CategorySummaryLike } from '@/lib/report-photo-cap';
// Client-safe import — `lib/storage/blob` is server-only (it pulls in
// `next/headers` via `lib/auth/guards`), so a `'use client'` page
// must not import it directly.
import { isBlobProviderActive } from '@/lib/storage/blob-provider';
import { thumbnailBackground } from '@/lib/format/photo-url';
import {
  base64PayloadFromDataUrl,
  downscalePhotoFile,
} from '@/lib/photo/downscale';
import { t, type Language } from '@/lib/i18n/keys';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';


/**
 * One photo, as a PAIRED entry.
 *
 * The URL and its blob must travel together — the previous code
 * built the two arrays with independent `.filter()` passes, so they
 * could drift apart (and did, when the blob provider is inactive).
 * Deriving both from one array makes drift structurally impossible.
 */
interface PhotoEntry {
  url: string;
  blob: ReportDraftPhotoBlob | null;
}

/**
 * Read a `File` as a data URL. NEVER throws.
 *
 * Used as the fallback when the downscale could not run — the
 * original bytes are better than no photo (the API's size gate
 * remains the last line of defence).
 */
async function readFileAsDataUrl(file: File): Promise<string | null> {
  try {
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
}

export default function PhotoPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  /**
   * The source of truth for the picked photos. `photoUrls` and
   * `photoBlobs` are DERIVED from this array.
   */
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [cap, setCap] = useState<number>(3);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * True while a large photo is being decoded + re-encoded. A
   * 4000×3000 decode plus a JPEG encode takes ~300–800 ms on a
   * mid-range phone, so the citizen needs feedback.
   */
  const [processing, setProcessing] = useState<boolean>(false);
  /**
   * The location the citizen picked in step 1, echoed back in the
   * reminder card (mockup 14's second card).
   *
   * BOTH locale labels are kept so the card can re-render in the
   * right language even if the preference is toggled after mount —
   * the mount effect below closes over the language as it was when
   * the draft was read, and re-running it on every language change
   * would re-fetch the bootstrap endpoint for nothing.
   */
  const [locationLabels, setLocationLabels] = useState<{
    bn: string | null;
    en: string | null;
  }>({ bn: null, en: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoUrls = photoEntries.map((e) => e.url);
  const photoBlobs = photoEntries
    .map((e) => e.blob)
    .filter((b): b is ReportDraftPhotoBlob => b !== null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!res.ok) {
          setAuthed(false);
          return;
        }
        const data = (await res.json()) as { categories: CategorySummaryLike[] };
        setAuthed(true);
        const draft = loadDraft();
        if (draft?.photoUrls) {
          // The draft's blobs are restored ALONGSIDE its URLs — the two
          // must stay in lock-step, otherwise a refresh would submit
          // the inline path with the raw bytes lost.
          setPhotoEntries(
            draft.photoUrls.map((url, idx) => ({
              url,
              blob: draft.photoBlobs?.[idx] ?? null,
            })),
          );
        }
        // The cap is re-derived from the draft's categoryId on every mount.
        setCap(derivePhotoCap(draft, data.categories));
        // The location reminder card shows where the pin was dropped.
        // The draft stores a human-readable label in both locales.
        // When neither is present the card is not rendered at all
        // rather than showing an empty heading.
        setLocationLabels({
          bn: draft?.locationLabelBn ?? null,
          en: draft?.locationLabel ?? null,
        });
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (authed === false) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p>{t('auth.signin_required_short', null, LANG)}</p>
        <a href="/">{t('auth.back_home', null, LANG)}</a>
      </div>
    );
  }

  if (loading) return <ReportFlowSkeleton lang={LANG} testId="report-photo-loading" />;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = cap - photoEntries.length;
    const incoming = Array.from(files).slice(0, remaining);
    if (incoming.length === 0) return;
    // The blob path needs the raw bytes; the render path needs the
    // data URL. Both are produced from the same File.
    const wantsBytes = isBlobProviderActive();
    setProcessing(true);
    Promise.all(
      incoming.map(async (file): Promise<PhotoEntry> => {
        // ── Downscale + compress ────────────────────────────────
        // A modern phone photo is 3–8 MB → a 4–11 MB base64 data
        // URL → the API rejects it and the citizen sees
        // "invalid_input". The WO-003 recommendation (1600px long
        // edge, JPEG q80) is applied here, client-side.
        //
        // If the downscale FAILS (unsupported codec, decode error),
        // we fall back to the ORIGINAL bytes — the downscale is an
        // optimisation, never a new hard failure mode. The API's
        // size gate still protects the server.
        const scaled = await downscalePhotoFile(file);
        const dataUrl = scaled.ok
          ? scaled.dataUrl
          : await readFileAsDataUrl(file);
        if (!dataUrl) {
          return { url: '', blob: null };
        }
        // The MIME type must reflect the DOWNSCALED bytes, not the
        // original file's — otherwise the blob store writes JPEG
        // bytes under a `.png` key.
        const mimeType = scaled.ok ? scaled.mimeType : file.type;
        if (!wantsBytes) {
          return { url: dataUrl, blob: null };
        }
        // Strip the `data:<mime>;base64,` prefix — the API
        // route re-assembles the bytes from the bare
        // base64 payload.
        const dataBase64 = base64PayloadFromDataUrl(dataUrl);
        return {
          url: dataUrl,
          blob: {
            dataBase64,
            mimeType,
            fileName: file.name,
          },
        };
      }),
    )
      .then((results) => {
        const added = results.filter((r) => r.url.length > 0);
        const nextEntries = [...photoEntries, ...added].slice(0, cap);
        setPhotoEntries(nextEntries);
        const next = nextEntries.map((e) => e.url);
        const nextBlobs = nextEntries
          .map((e) => e.blob)
          .filter((b): b is ReportDraftPhotoBlob => b !== null);
        const draft = loadDraft();
        if (draft) {
          saveDraft({
            ...draft,
            photoUrls: next,
            photoBlobs: nextBlobs,
            step: 'photo',
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setProcessing(false));
  }

  function removePhoto(idx: number) {
    const nextEntries = photoEntries.filter((_, i) => i !== idx);
    setPhotoEntries(nextEntries);
    const next = nextEntries.map((e) => e.url);
    const nextBlobs = nextEntries
      .map((e) => e.blob)
      .filter((b): b is ReportDraftPhotoBlob => b !== null);
    const draft = loadDraft();
    if (draft) {
      saveDraft({
        ...draft,
        photoUrls: next,
        photoBlobs: nextBlobs,
        step: 'photo',
      });
    }
  }

  function handleContinue() {
    if (photoUrls.length < 1) return;
    const draft = loadDraft();
    if (!draft) return;
    saveDraft({ ...draft, photoUrls, photoBlobs, step: 'category' });
    router.push('/report/category');
  }

  const canAddMore = photoUrls.length < cap;
  const capReached = photoUrls.length >= cap;
  const remaining = Math.max(0, cap - photoUrls.length);
  /**
   * The label for the location reminder card, resolved in the
   * CURRENT language at render time.
   */
  const locationLabel =
    (LANG === 'bn' ? locationLabels.bn : locationLabels.en) ??
    locationLabels.bn ??
    locationLabels.en ??
    null;
  /**
   * The mockup's grid has one cell per SLOT, so the grid always
   * shows `cap` cells: the filled ones show the photo, the rest are
   * "add photo" affordances. When the cap is reached there is no
   * free cell left to offer.
   */
  const emptySlots = capReached ? 0 : Math.min(cap - photoUrls.length, 3);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        /*
         * Size against the CONTENT REGION, not the viewport.
         *
         * `calc(100vh - var(--header-height-desktop))` subtracted only
         * the global header and ignored the step-indicator strip, so
         * the page was 124px taller than the space it had and
         * `.role-app-content` scrolled — the scrollbar the citizen saw
         * on every report step.
         */
        height: 'var(--report-content-height)',
        minHeight: 0,
        // Reserve the FIXED action bar's footprint so the last
        // element in the column is never hidden behind it.
        paddingBottom:
          'calc(var(--sticky-cta-height) + var(--space-3) * 2 + 1px + var(--space-8))',
      }}
      className="report-two-region"
      data-report-step-page
    >
      {/*
        The CSS is injected raw. React escapes quote characters in a
        `<style>` child's text content, so the server emitted
        `&quot;` / `&#x27;` where the client rendered `"` / `'`
        — a hydration mismatch that forced a full client re-render.
        `dangerouslySetInnerHTML` keeps the CSS byte-identical on
        both sides. The content is a static literal, not user input.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .report-photo-tile { transition: none !important; }
        }
        @media (max-width: 768px) {
          .report-photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        /*
         * On a SHORT viewport the step carries two cards and the
         * photo grid is square (so its height is driven by its
         * width). Tightening the card padding gives the column back
         * the room it needs so the step fits without a scrollbar.
         */
        @media (max-height: 860px) {
          .report-photo-card,
          .report-photo-location-reminder { padding-top: var(--space-4) !important; padding-bottom: var(--space-4) !important; }
          .report-photo-grid { max-width: 400px !important; }
        }
        /*
         * PHONE: the last word on the photo step's sizing.
         *
         * A phone is short AND narrow, so both of the queries above
         * match it and the later one wins — the short-viewport rule
         * was undoing the narrow-viewport rule. This block sits last
         * on purpose and re-asserts the phone's tighter budget.
         *
         * Three savings, all of them in the step's least essential
         * parts: the grid is capped so its square tiles shrink, the
         * card padding tightens, and the location reminder — which
         * only repeats a location the citizen already confirmed — drops
         * to a single line with the button beside it.
         */
        @media (max-width: 480px) {
          .report-photo-grid {
            max-width: 240px !important;
            margin-left: auto;
            margin-right: auto;
          }
          .report-photo-card {
            padding-top: var(--space-3) !important;
            padding-bottom: var(--space-3) !important;
          }
          .report-photo-card > p { margin-bottom: var(--space-2) !important; }
          .report-photo-location-reminder {
            padding-top: var(--space-2) !important;
            padding-bottom: var(--space-2) !important;
            gap: var(--space-2) !important;
          }
          /* One line on a phone: the title is redundant next to the
             address itself, and the button carries the label. */
          .report-photo-location-reminder h2 { display: none; }
        }
        /*
         * A VERY SHORT phone (≤ 700px tall). The photo grid's tiles
         * are square, so the grid's height is driven by its width —
         * and on a 360px-wide screen a 240px grid is still 240px
         * tall, which is a third of the 543px region.
         *
         * The grid is capped by the HEIGHT it may occupy rather than
         * by its width, so the tiles stay square but smaller, and the
         * step fits without a scrollbar.
         */
        @media (max-width: 480px) and (max-height: 700px) {
          .report-photo-grid { max-width: 170px !important; }
          .report-photo-column { padding-top: var(--space-2) !important; padding-bottom: var(--space-2) !important; gap: var(--space-2) !important; }
          .report-photo-card { padding-top: var(--space-2) !important; padding-bottom: var(--space-2) !important; }
          .report-photo-card > p { margin-bottom: var(--space-1) !important; font-size: var(--text-body-sm) !important; }
        }
      `,
        }}
      />

      <div
        style={{
          // `--space-4` vertical (16px) rather than `--space-6`
          // (32px): the step carries TWO cards, and at 32px the
          // column's own padding alone pushed it past the region,
          // which raised a scrollbar.
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          // The page fills the region exactly, so this column must be
          // able to scroll ITSELF when the photo grid is tall. Without
          // this the column grows past the region and the whole page
          // scrolls instead.
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
        className="report-photo-column"
      >
        {/* ---------- STEP CARD ---------- */}
        <section
          style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            // `--space-5` (24px) rather than `--space-6` (32px): the
            // photo step carries TWO cards (the photo card and the
            // location reminder), and at 32px each their padding
            // alone pushed the column past the region.
            padding: 'var(--space-5)',
          }}
          className="report-photo-card"
          data-testid="report-photo-card"
        >
          <h1
            lang={LANG}
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-display-md)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-ink)',
            }}
          >
            {t('report.photo.h1', null, LANG)}
          </h1>
          <p
            lang={LANG}
            style={{
              color: 'var(--color-ink-secondary)',
              // `--space-4` (16px) rather than `--space-5` (24px): the
              // step carries two cards and the extra 8px here pushed
              // the column past the region.
              margin: '0 0 var(--space-4)',
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {t('report.photo.help', { cap }, LANG)}
          </p>

          {/* ---------- PHOTO CAP INDICATOR ----------
              "1 / 3 ছবি" — the count, the cap and the unit in one
              line. The mockup never shows a bare progress bar: a
              bar alone would hide the number the citizen needs.
              `role="status"` so the count is announced when it
              changes. The digits are ASCII: `interpolate` does
              `String(v)`, and the mockup was corrected to match
              the production format for exactly this reason. */}
          <div
            role="status"
            aria-live="polite"
            // The VISIBLE text is the fraction "1 / 3 ছবি" (the
            // mockup's format, and the format the spec asserts).
            // A fraction read aloud is meaningless, so the
            // accessible name spells the same fact out. The label
            // is on the live region, so a screen reader announces
            // the sentence — not the raw digits.
            aria-label={t(
              'report.photo.counter_aria',
              { count: photoUrls.length, cap },
              LANG,
            )}
            data-testid="report-photo-counter"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 'var(--space-2)',
                height: 'var(--space-2)',
                borderRadius: '50%',
                background: capReached
                  ? 'var(--color-status-resolved)'
                  : 'var(--color-accent)',
              }}
            />
            <span
              style={{
                color: 'var(--color-ink)',
                fontWeight: 'var(--weight-bold)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('report.photo.counter', { count: photoUrls.length, cap }, LANG)}
            </span>
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                // Mockup 14's `.cap-bar` is exactly 72px × 6px. The
                // `--space-*` ramp tops out at `--space-9` (96px),
                // so the width is the token scale stepped down from
                // the mockup rather than a raw pixel value.
                width: 'calc(var(--space-9) * 0.75)',
                height: 'var(--space-2)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-surface-sunken)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.min(100, (photoUrls.length / Math.max(1, cap)) * 100)}%`,
                  background: 'var(--color-primary)',
                  borderRadius: 'var(--radius-pill)',
                }}
              />
            </span>
          </div>

          {/* Processing hint — a large photo is decoded + re-encoded
              before it is sent, which takes a moment on a phone. */}
          {processing && (
            <p
              role="status"
              aria-live="polite"
              lang={LANG}
              style={{
                margin: 'var(--space-3) 0 0',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {t('report.photo.processing', null, LANG)}
            </p>
          )}

          {/* ---------- PHOTO GRID ----------
              One cell per slot. The mockup shows the photo in the
              filled cell (not a placeholder) and an "add photo"
              affordance in each free cell. */}
          <div
            className="report-photo-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)',
              /*
               * The tiles are SQUARE (`aspectRatio: 1 / 1`), so the
               * grid's height is driven by its WIDTH. Uncapped, a
               * wide content column made each tile ~200px and the
               * grid ~200px tall, which pushed the step past the
               * region and raised a scrollbar on the photo step.
               *
               * Capping the grid's width keeps the tiles at a
               * comfortable size (and the grid ~150px tall) on any
               * column width. The grid stays LEFT-aligned, so it
               * does not drift away from the card's text.
               */
              maxWidth: 460,
            }}
            data-testid="report-photo-grid"
          >
            {photoUrls.map((url, idx) => (
              <div
                key={idx}
                role="listitem"
                className="report-photo-tile"
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background:
                    thumbnailBackground(url) ??
                    'var(--color-surface-raised)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {/* The photo itself is the content — it is announced
                    as an image so a screen-reader user knows the
                    cell is not empty. */}
                <span
                  role="img"
                  aria-label={`${t('report.photo.h1', null, LANG)} ${idx + 1}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url("${url}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 'var(--space-1)',
                    right: 'var(--space-1)',
                  }}
                >
                  <IconButton
                    label={t('report.photo.remove_one_aria', { index: idx + 1 }, LANG)}
                    icon={<ICONS.close.icon size={14} weight={ICONS.close.weight} />}
                    variant="secondary"
                    size="sm"
                    onClick={() => removePhoto(idx)}
                    data-testid={`report-photo-remove-${idx}`}
                    style={{
                      // The visible control is painted at 44px (the
                      // touch-target floor) rather than the
                      // primitive's 32px `sm`. The primitive sizes
                      // the BUTTON to the floor on its own, so this
                      // override only changes how the control LOOKS.
                      width: 'var(--touch-min)',
                      height: 'var(--touch-min)',
                      background: 'var(--color-surface-card)',
                      borderRadius: '50%',
                    }}
                  />
                </span>
              </div>
            ))}

            {Array.from({ length: emptySlots }).map((_, i) => (
              <Button
                key={`empty-${i}`}
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canAddMore}
                aria-disabled={!canAddMore}
                aria-label={t('report.photo.add_more_aria', { remaining }, LANG)}
                title={capReached ? t('report.photo.cap_tooltip', { cap }, LANG) : undefined}
                data-testid={`report-photo-add-${i}`}
                style={{
                  aspectRatio: '1 / 1',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  border: '1px dashed var(--color-border-strong)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-ink-tertiary)',
                  fontSize: 'var(--text-micro)',
                  fontWeight: 'var(--weight-semibold)',
                }}
                icon={<ICONS.camera.icon size={24} weight={ICONS.camera.weight} />}
              >
                {t('report.photo.add_more', null, LANG)}
              </Button>
            ))}
          </div>

          {/* ---------- HINT CARD ----------
              The privacy promise is a product promise, so it sits
              on the surface as a readable sentence rather than a
              footnote. */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-start',
              marginTop: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 'var(--leading-snug)',
            }}
            data-testid="report-photo-hint"
          >
            <span
              aria-hidden
              style={{ flexShrink: 0, color: 'var(--color-accent)', display: 'inline-flex' }}
            >
              <ICONS.info.icon size={15} weight={ICONS.info.weight} />
            </span>
            <span lang={LANG}>{t('report.photo.privacy_short', null, LANG)}</span>
          </div>
        </section>

        {/* ---------- LOCATION REMINDER CARD ----------
            The citizen already pinned the location in step 1. The
            mockup repeats it here so they can confirm the photo
            matches the place they reported — and offers a way back
            to step 1 if it does not. */}
        {locationLabel ? (
          <section
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4) var(--space-5)',
              /*
               * A COMPACT STRIP, not a stacked card.
               *
               * The photo step already carries the photo card, and
               * the reminder is secondary — the citizen pinned the
               * location in step 1. Stacked (title, label, button on
               * their own lines) the reminder was ~180px tall and
               * pushed the column past the region, so the step
               * scrolled. Laying the text out beside the button
               * keeps all the information in one ~64px row.
               */
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
            className="report-photo-location-reminder"
            data-testid="report-photo-location-reminder"
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <h2
                lang={LANG}
                style={{
                  margin: 0,
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink)',
                  lineHeight: 'var(--leading-tight)',
                }}
              >
                {t('report.photo.location_title', null, LANG)}
              </h2>
              <p
                lang={LANG}
                style={{
                  margin: 0,
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {locationLabel}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<ICONS.mapPin.icon size={15} weight={ICONS.mapPin.weight} />}
              data-testid="report-photo-change-location"
              onClick={() => router.push('/report/location')}
            >
              {t('report.photo.change_location', null, LANG)}
            </Button>
          </section>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <ReportStepAside
        currentStep={2}
        totalSteps={5}
        lang={LANG}
        sticky
        help={t('report.photo.privacy', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleContinue}
            disabled={photoUrls.length < 1}
            aria-disabled={photoUrls.length < 1}
            trailing={
              <span aria-hidden style={{ display: 'inline-flex' }}>
                <ICONS.forward.icon size={16} weight={ICONS.forward.weight} />
              </span>
            }
            data-testid="report-photo-continue"
          >
            {t('report.step.continue_next', { next: t('report.step.3', null, LANG) }, LANG)}
          </ReportStepPrimary>
        }
        back={
          <ReportStepBack href="/report/location">
            {t('report.step.back', null, LANG)}
          </ReportStepBack>
        }
      />
    </div>
  );
}
