#!/usr/bin/env bash
# Run ONLY the two specs whose visual baselines still differ, and write
# the diff images into $DIFF_OUT (a host-mounted directory) so they can
# be inspected after the container exits.
#
# The other 324 specs pass; this is a focused diagnostic, not the
# measurement run (that is `run-specs-in-container.sh`).
set -uo pipefail

cd /tmp || exit 1

export CI=1
export CITYFIX_DEV_STORE=1
export DEV_SKIP_WEBAUTHN=1
export CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z
export NEXT_PUBLIC_CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z
export TZ=Asia/Dhaka

echo "=== install the browser that matches the installed playwright ==="
./node_modules/.bin/playwright install --with-deps chromium 2>&1 | tail -3

echo "=== prisma generate (linux query engine) ==="
./node_modules/.bin/prisma generate 2>&1 | tail -3

ARGON2_VERSION=$(node -p "require('./node_modules/@node-rs/argon2/package.json').version")
npm install --no-save --no-audit --no-fund \
  "@node-rs/argon2-linux-x64-gnu@${ARGON2_VERSION}" 2>&1 | tail -3

echo "=== running the two specs ==="
./node_modules/.bin/playwright test \
  tests/18-admin-audit-light.spec.ts \
  tests/19-admin-tickets-light.spec.ts \
  > /tmp/playwright-two.log 2>&1
status=$?

echo "--- exit status: $status ---"
tail -30 /tmp/playwright-two.log

# Copy the diff artifacts into the host-mounted output directory.
echo "=== copying diff artifacts out ==="
OUT="${DIFF_OUT:-/tmp/diffs}"
mkdir -p "$OUT"
if [ -d tests-mockups/artifacts ]; then
  find tests-mockups/artifacts -type f \( -name '*.png' -o -name 'error-context.md' \) \
    | while read -r f; do
        base=$(basename "$(dirname "$f")")
        cp "$f" "$OUT/$base-$(basename "$f")" 2>/dev/null \
          && echo "copied $OUT/$base-$(basename "$f")"
      done
fi

echo "=== done ==="
exit 0
