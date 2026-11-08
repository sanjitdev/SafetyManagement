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
MSYS_NO_PATHCONV=1 tar -cf "$STAGE/base.tar" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='coverage' \
  --exclude='test-results' \
  --exclude='tests-mockups/html-report' \
  --exclude='tests-mockups/artifacts' \
  --exclude='.git' \
  --exclude='design-artifacts' \
  --exclude='aidlc' \
  --exclude='_bmad' \
  --exclude='_progress' \
  --exclude='presentation' \
  --exclude='ui-audit-shots' \
  --exclude='ui-design' \
  --exclude='*.tsbuildinfo' \
  app lib components public prisma scripts tests tests-mockups \
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
if ! tar -tf "$STAGE/base.tar" | grep -qF 'node_modules/.bin/playwright'; then
  echo "FATAL: node_modules/.bin/playwright is NOT in the combined archive."
  echo "The concatenation did not merge — the archive would extract without"
  echo "node_modules and the whole suite would fail for that reason."
  exit 1
fi
echo "node_modules/.bin/playwright present: OK"

echo "=== gzip ==="
gzip -f "$STAGE/base.tar"
mv "$STAGE/base.tar.gz" "$STAGE/combined.tar.gz"

echo "combined size: $(du -h "$STAGE/combined.tar.gz" | cut -f1)"
echo "combined entries (from the gzip): $(tar -tzf "$STAGE/combined.tar.gz" | wc -l)"
