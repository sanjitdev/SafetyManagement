---
id: 008-003-crew-after-photo-upload
unit: 003-crew-after-photo-upload
intent: 008-ux-polish-from-demo
type: simple-construction-bolt
status: complete
stories:
  - 001-crew-after-photo-accepts-multipart
created: 2026-10-14T18:25:00Z
started: 2026-10-14T18:25:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-14T18:25:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-14T19:45:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-14T20:00:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
  estimated_files: 5
---

# Bolt 008-003 — Crew After-photo File Upload

## Purpose

Land the file-upload half of Intent 008 in one bolt:

1. **FR-5** — Allow crew members to upload the after-photo
   as a real file (the existing citizen photo route already
   accepts multipart; the same shape is added to the
   crew route). The URL input stays available as a
   collapsible "Power user: paste a URL" disclosure so the
   dev-store demo path keeps working.

The citizen photo upload already accepts multipart; the
crew route only accepts `{ photoUrl: string }`. The fix is
to widen the crew route's input shape to accept both.

## Stories

### From Unit 003 (crew after-photo upload)
| Story ID | Title | FR |
|----|-------|----|
| 001-crew-after-photo-accepts-multipart | Crew after-photo accepts multipart; URL input stays as collapsible override | FR-5 |

## Files Modified

- `app/api/v1/crew/tickets/[id]/photos/route.ts` — accept
  `multipart/form-data` with a `photo` file part; keep
  the existing `{ photoUrl: string }` body shape as a
  power-user override.
- `app/crew/tickets/[id]/page.tsx` — replace the URL
  input with a real file input + collapsible URL
  override.
- `lib/crew/upload-photo.ts` — new service helper
  (or extend an existing one) that handles both shapes.
- `tests/unit/crew/upload-photo.test.ts` — new unit test
  for the multipart path.
- `tests/23-crew-after-photo-file-upload.spec.ts` — new
  Playwright E2E that drives the file upload via
  `setInputFiles(...)` and asserts the after-photo
  appears on the citizen surface.

## Implementation Notes

### Route shape (Zod)

```ts
const FileUpload = z.object({
  photo: z.instanceof(File).optional(),
  photoUrl: z.string().url().optional(),
}).superRefine((data, ctx) => {
  if (!data.photo && !data.photoUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['photo'],
      message: 'either_photo_or_photoUrl_required',
    });
  }
});
```

### UI shape

```tsx
<fieldset>
  <label htmlFor="crew-photo-file" data-testid="crew-photo-file-label">
    {t('crew.photo.file.label', null, lang)}
  </label>
  <input
    id="crew-photo-file"
    data-testid="crew-photo-file"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onChange={onFileChange}
  />
  <details>
    <summary>{t('crew.photo.url.override', null, lang)}</summary>
    <input
      type="url"
      data-testid="crew-photo-url"
      placeholder={t('crew.photo.url.placeholder', null, lang)}
      value={photoUrl}
      onChange={(e) => setPhotoUrl(e.target.value)}
    />
  </details>
  <button data-testid="crew-photo-submit" disabled={!hasFile && !photoUrl}>
    {t('crew.photo.submit', null, lang)}
  </button>
</fieldset>
```

### i18n keys (new — registered in Bolt 008-001)

| Key | bn | en |
|-----|----|----|
| `crew.photo.file.label` | `ফিক্সের প্রমাণ ছবি আপলোড করুন` | `Upload proof-of-fix photo` |
| `crew.photo.url.override` | `URL পেস্ট করুন (পাওয়ার ইউজার)` | `Paste a URL (power user)` |
| `crew.photo.url.placeholder` | `https://…` | `https://…` |
| `crew.photo.submit` | `আপলোড করুন` | `Upload` |

### MIME + size limits

The citizen photo route's existing limits apply (MIME:
`image/jpeg`, `image/png`, `image/webp`; size: 5 MB).
Verified at the bolt's technical-design stage.

### Test strategy

- **Unit test** (`tests/unit/crew/upload-photo.test.ts`):
  - Multipart path: `photo` file present, `photoUrl` absent
    → `photo` uploaded, audit row written.
  - URL path: `photoUrl` present, `photo` absent → `photoUrl`
    uploaded, audit row written.
  - Neither: 400 `either_photo_or_photoUrl_required`.
  - Both: prefer `photo` (file takes precedence).
  - Cross-crew: 403 `forbidden_role`.
  - Out-of-scope ticket: 404 `not_found`.
- **Playwright E2E** (`tests/23-crew-after-photo-file-upload.spec.ts`):
  - Crew member opens a routed ticket, uploads a fixture
    file, asserts the after-photo appears in the trail.
  - Re-login as the citizen, assert the after-photo is
    visible on `/citizen/reports/[id]`.
- **Slow-motion demo re-run** — the demo's after-photo
  step now uses `setInputFiles(...)` (no URL typing).

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
- The new unit test is green.
- The new Playwright E2E is green.
- The slow-motion demo re-run drives the file upload
  via `setInputFiles(...)` and the after-photo appears
  on the citizen surface.

## Out of Scope

- i18n key registration — Bolt 008-001 (the 4 keys are
  registered in 008-001; this bolt only uses them).
- Visible chrome (header dedup, display names) — Bolt
  008-002.
- Photo editing, photo annotations, bulk upload.
- A different MIME set (the citizen route's MIME set is
  the v1 set).
- A progress indicator (the upload is small; not needed
  in v1).

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| Multipart parsing fails on the dev store (no `FormData` polyfill) | The dev store's request handler reads `request.formData()` — already used by the citizen route. Verified at bolt start. |
| The file is too large (5 MB) | The existing citizen route enforces the limit; the same limit applies. |
| The MIME type is wrong (e.g., `image/heic`) | The existing route's MIME allow-list applies; rejected uploads return 400. |
| The URL path becomes a security hole (e.g., SSRF) | The existing URL path already validates the URL shape; the bolt doesn't loosen the validation. |
| The slow-motion demo can't find the file picker | `setInputFiles(...)` is the canonical Playwright API; the test uses it. |
