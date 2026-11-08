#!/bin/bash
# Build the archive the container runner consumes.
#
# ONE archive, not two. `cat a.tar.gz b.tar.gz | tar -xzf -` does NOT work:
# GNU tar's gzip reader stops at the first archive's end-of-archive marker,
# so the second stream is read as garbage —
#
#   gzip: stdin: not in gzip format
#
# And `cat a.tar b.tar > c.tar` does not work EITHER, for the same reason
# at the uncompressed level: tar reads the first archive and stops at its
# end-of-archive marker. The concatenation is a valid gzip stream but a
# tar reader only ever sees the FIRST member set — which is how a
# 1.2 GB `node_modules` silently vanished from the archive.
#
# `tar --concatenate` (-A) is the operation that MERGES two archives
# properly: it rewrites the headers so the result is a single tar with
# one end-of-archive marker.
set -euo pipefail

REPO="C:/ZDrive Folders/E2E_Training/SafetyManagement"
STAGE="/tmp/cf-archive"

rm -rf "$STAGE"
mkdir -p "$STAGE"

cd "$REPO"

echo "=== base tree ==="
#
# `design-artifacts` is INCLUDED, and it must stay.
#
# `app/globals.css` imports
# `../design-artifacts/D-Design-System/01-Visual-Design/tokens.css` —
# the design-token source of truth. Excluding the tree makes the dev
# server fail to compile with "Module not found: Can't resolve
# '../design-artifacts/.../tokens.css'", and the whole Playwright run
# dies at "Timed out waiting 60000ms from config.webServer" before a
# single spec executes.
#
# The tree is large but it is not the 1.2 GB `node_modules`; the cost
# is a few hundred MB of mockup HTML and PNGs, which is the price of
# a runnable container.
MSYS_NO_PATHCONV=1 tar -cf "$STAGE/base.tar" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='coverage' \
  --exclude='test-results' \
  --exclude='tests-mockups/html-report' \
  --exclude='tests-mockups/artifacts' \
  --exclude='.git' \
  --exclude='aidlc' \
  --exclude='_bmad' \
  --exclude='_progress' \
  --exclude='presentation' \
  --exclude='ui-audit-shots' \
  --exclude='ui-design' \
  --exclude='*.tsbuildinfo' \
  app lib components public prisma scripts tests tests-mockups \
  design-artifacts \
  package.json package-lock.json tsconfig.json next.config.js \
  next-env.d.ts postcss.config.js tailwind.config.js \
  vitest.config.ts playwright.config.ts eslint.config.mjs

echo "base entries: $(tar -tf "$STAGE/base.tar" | wc -l)"

echo "=== node_modules (windows tree — the linux bindings are installed in-container) ==="
MSYS_NO_PATHCONV=1 tar -cf "$STAGE/nm.tar" node_modules

echo "nm entries: $(tar -tf "$STAGE/nm.tar" | wc -l)"

echo "=== concatenate (merges the two into ONE tar with one end marker) ==="
MSYS_NO_PATHCONV=1 tar --concatenate -f "$STAGE/base.tar" "$STAGE/nm.tar"

combined_entries=$(tar -tf "$STAGE/base.tar" | wc -l)
echo "combined entries: $combined_entries"

# The whole point of the merge — assert it took, rather than trusting it.
#
# WHY A TEMP FILE AND NOT A PIPE
# -----------------------------
# `tar -tf ... | grep -qF <needle>` is a FALSE NEGATIVE under
# `set -o pipefail`. `grep -q` exits the moment it finds a match,
# which closes the pipe; `tar` then dies of SIGPIPE (exit 141 =
# 128+13). `pipefail` reports the pipeline's status as the RIGHTMOST
# non-zero exit — so the pipeline "fails" with 141 even though grep
# matched. The assertion would then reject a perfectly good archive.
#
# This is not theoretical: it fired on a real archive that DID contain
# node_modules/.bin/playwright. Writing the listing to a file first
# removes the pipe, so no SIGPIPE can occur and the exit status is
# grep's own.
tar -tf "$STAGE/base.tar" > "$STAGE/listing.txt"
if ! grep -qF 'node_modules/.bin/playwright' "$STAGE/listing.txt"; then
  echo "FATAL: node_modules/.bin/playwright is NOT in the combined archive."
  echo "The concatenation did not merge — the archive would extract without"
  echo "node_modules and the whole suite would fail for that reason."
  exit 1
fi
echo "node_modules/.bin/playwright present: OK"

# The dev server cannot even BOOT without the design tokens:
# `app/globals.css` imports
# `../design-artifacts/D-Design-System/01-Visual-Design/tokens.css`.
# A missing file here surfaces as "Timed out waiting 60000ms from
# config.webServer" — a failure that looks like a hang, not a missing
# file — so assert it here instead.
if ! grep -qF 'design-artifacts/D-Design-System/01-Visual-Design/tokens.css' "$STAGE/listing.txt"; then
  echo "FATAL: tokens.css is NOT in the archive."
  echo "app/globals.css imports it, so the dev server would fail to"
  echo "compile and every spec would time out waiting for the web server."
  exit 1
fi
echo "design tokens present: OK"
rm -f "$STAGE/listing.txt"

echo "=== gzip ==="
gzip -f "$STAGE/base.tar"
mv "$STAGE/base.tar.gz" "$STAGE/combined.tar.gz"

echo "combined size: $(du -h "$STAGE/combined.tar.gz" | cut -f1)"
echo "combined entries (from the gzip): $(tar -tzf "$STAGE/combined.tar.gz" | wc -l)"
