
---

## Addendum — 2026-10-29 — thumbnail hotfix test evidence

A remediation pass inside this bolt's scope fixed the missing
report-card thumbnails. The full write-up is in
**`./ddd-04-thumbnail-hotfix.md`**; the test evidence is
summarised here.

### New / updated test files

| File | Status | Tests |
|------|--------|-------|
| `tests/unit/photo-url-api-boundary.test.ts` | **new** | 12 |
| `tests/unit/report-card-thumbnail-render.test.ts` | **new** | 13 |
| `tests/unit/format/photo-url.test.ts` | extended (+81 lines) | 23 |

### What the new tests pin

1. **The API boundary contract.** `POST /api/tickets` and
   `POST /api/v1/crew/tickets/[id]/photos` must validate the photo
   URL with `isAcceptablePhotoUrl`, not `z.string().url()`. The
   test also asserts that `z.string().url()` is the **wrong**
   contract — it accepts `javascript:` and rejects the
   root-relative `/api/blob/…` shape — so the reasoning behind
   the change cannot silently regress.
2. **The write/read contract agreement.** `isAcceptablePhotoUrl`
   and `isRenderablePhotoUrl` must return the same verdict for
   every case.
3. **The render contract.** Every list-row surface that receives
   `photoUrls` must resolve a renderable URL and emit an image
   element; the dispatcher monitor must build its background
   through the quoted `thumbnailBackground(...)` helper, not an
   unquoted `url(...)`; and the crew detail page must not put a raw
   photo URL into a clickable `href`.

### Verification (2026-10-29)

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | **939 passed / 939**, 65 files |
| Visual | `npm run test:mockups` | **15 passed** |
| Lint | `npm run lint` | 0 errors (53 pre-existing warnings) |

One pre-existing flake was observed and ruled out: `tests/unit/
webauthn-prod-guard.test.ts` timed out at 5000 ms in the first
full-suite run. It passes in isolation (2337 ms) and on a clean
stashed tree (1857 ms) — a timeout flake under parallel transform
load, unrelated to this work. The final suite run shows it green.
