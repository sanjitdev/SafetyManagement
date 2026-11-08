#!/usr/bin/env bash
# Run the CityFix Playwright route specs inside the Playwright Linux container.
#
# WHY THIS EXISTS
# ---------------
# The route specs (`tests/*.spec.ts`, 34 files) have never been executed in
# this environment — the audit records them as "not executed" because CI runs
# only the unit suite and the mockup baselines. The mockup baselines are
# Linux-generated and CI-gated, but the ROUTE specs are Windows-skipped.
#
# The Playwright image pins a BROWSER build, but `package.json` declares
# `"@playwright/test": "^1.63.0"`, and a caret range resolves to the newest
# 1.x — currently 1.65. The image therefore ships a browser that the
# installed Playwright does not expect. The script installs the matching
# Chromium itself, exactly as CI does (`npx playwright install --with-deps
# chromium`), so the browser here is the same one CI asserts with.
#
# USAGE
#   (cat combined.tar.gz) | MSYS_NO_PATHCONV=1 docker run --rm -i \
#     mcr.microsoft.com/playwright:v1.63.0-noble \
#     bash -c 'tar -xzf - -C /tmp && cd /tmp && \
#              bash scripts/run-specs-in-container.sh'
#
# The repo is streamed in over stdin as ONE gzip tar archive holding both
# the source tree and `node_modules`, because a volume mount of the working
# directory is not permitted in this environment.
#
# ONE archive, not two. `cat a.tar.gz b.tar.gz | tar -xzf -` does NOT work:
# GNU tar's gzip reader stops at the first archive's end-of-archive marker,
# so the second stream is read as garbage —
#
#   gzip: stdin: not in gzip format
#
# and the second tree is silently dropped. Then `npx` finds no local
# `playwright` or `vitest`, downloads a fresh copy of each from the
# registry, and the run fails for reasons that have nothing to do with the
# specs.
#
# The command string extracts the archive and then runs the extracted copy
# of this script. It cannot be `bash /tmp/scripts/run-specs-in-container.sh`
# — that path does not exist until the archive has been extracted, so bash
# would fail before a single byte was unpacked. For the same reason this
# script does NOT extract its own input: by the time it runs, stdin is
# already consumed.

set -uo pipefail

cd /tmp || exit 1

export CI=1
export CITYFIX_DEV_STORE=1
export DEV_SKIP_WEBAUTHN=1

# THE CLOCK IS PINNED
# -------------------
# `CITYFIX_SEED_NOW` freezes the dev server's clock, and `TZ` pins the
# process timezone to the product's zone. Without them every seeded
# timestamp moves with the wall clock and the rendered pages change
# minute by minute — so the visual baselines could never hold, and the
# run's result would depend on WHEN it ran.
#
# The value MUST match the one in `playwright.config.ts` and in both
# GitHub workflows. That is what makes a baseline reproducible rather
# than merely current.
export CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z
# The SAME pin under the PUBLIC name. `process.env` is server-only, so
# a client component rendering a timestamp falls back to the wall clock
# in the browser while the server reads the pinned one — and React fails
# the hydration ("Text content did not match"). The `NEXT_PUBLIC_`
# prefix is what makes the value visible to the client bundle, so both
# sides agree by construction.
export NEXT_PUBLIC_CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z
export TZ=Asia/Dhaka

echo "=== node / playwright versions ==="
node --version
# Resolve Playwright from the REPO's node_modules, not the npx cache.
# `npx` will otherwise fetch a different version from the registry.
./node_modules/.bin/playwright --version 2>&1 | tail -1

echo
echo "=== install the browser that matches the installed playwright ==="
# The image ships a browser for its own pinned Playwright version, which is
# not necessarily the one in node_modules. Installing here makes the two
# agree. CI does the same thing.
./node_modules/.bin/playwright install --with-deps chromium 2>&1 | tail -8

# The Prisma client was generated on the host (Windows) and its Query Engine
# binary is platform-specific. Without this the dev server logs
# "PrismaClientInitializationError: could not locate the Query Engine for
# runtime debian-openssl-3.0.x" on every request that touches the database
# facade, and the route specs fail for that reason rather than their own.
echo "=== prisma generate (linux query engine) ==="
./node_modules/.bin/prisma generate 2>&1 | tail -5

# THE NATIVE ADDONS MUST MATCH THE PLATFORM
# -----------------------------------------
# `node_modules` is archived on the dev machine (Windows) and unpacked
# here (Linux). Two families of packages in that tree are PLATFORM-SPECIFIC
# and were therefore archived in their Windows form only:
#
#   - `@node-rs/argon2-win32-x64-msvc`   (the argon2 native binding)
#   - Prisma's Query Engine               (handled by `prisma generate` above)
#
# `@node-rs/argon2` loads its binding at require time and throws
# "Cannot find native binding" when the platform package is absent. The
# password module swallows that error and returns `false`, so every
# password login is rejected as WRONG CREDENTIALS and the whole
# route-spec suite fails with 50 misleading "login timed out" errors.
#
# The specs were not at fault; the environment was. This installs the
# Linux binding so the tree matches the platform it is running on.
echo
echo "=== install the linux native bindings ==="
# The binding version must MATCH the `@node-rs/argon2` loader version, so
# it is read from the installed package rather than hard-coded. A mismatch
# produces a different failure ("was compiled against a different Node.js
# version") that reads like a Node mismatch rather than a package mismatch.
ARGON2_VERSION=$(node -p "require('./node_modules/@node-rs/argon2/package.json').version")
echo "argon2 version: $ARGON2_VERSION"

# `--no-save` keeps package.json and package-lock.json untouched: the
# platform packages are optional dependencies that npm resolves per
# platform, and adding them by hand would pin one platform into the lock
# file and break the Windows dev machine.
npm install --no-save --no-audit --no-fund \
  "@node-rs/argon2-linux-x64-gnu@${ARGON2_VERSION}" 2>&1 | tail -5

echo "--- installed @node-rs packages ---"
ls node_modules/@node-rs/

echo "--- argon2 binding load test ---"
# Fail LOUDLY here. A broken native binding must stop the run before it
# produces 50 misleading failures, not after.
node -e "
try {
  require('@node-rs/argon2');
  console.log('argon2 native binding loaded OK');
} catch (e) {
  console.error('argon2 native binding FAILED:', e.message);
  process.exit(1);
}
" || exit 1

echo
echo "=== test list ==="
./node_modules/.bin/playwright test --list 2>&1 | tail -15

if [ "${1:-}" = "--list" ]; then
  exit 0
fi

echo
echo "=== running specs ==="
# `01-mockups.spec.ts` renders the STATIC design mockups from
# design-artifacts/ and diffs them against the committed baselines in
# tests-mockups/baselines/. Those baselines are asserted by the CI mockup
# job, which regenerates them on ubuntu-latest — they are not route specs.
# `--grep-invert` excludes them here so this script measures the route
# specs only.
#
# The FULL output goes to a file inside the container, not through a pipe.
# A `| tail -150` shows only the LAST 150 lines, which is the tail of the
# failure LIST — the first failure's actual error is gone by then, and
# that is the one that matters. The file is written to /tmp so it can be
# copied out of the container afterwards.
./node_modules/.bin/playwright test --grep-invert 'CityFix mockup baselines' "$@" \
  > /tmp/playwright-full.log 2>&1
status=$?

echo "--- exit status: $status ---"
echo "--- full log: /tmp/playwright-full.log ($(wc -l < /tmp/playwright-full.log) lines) ---"
tail -60 /tmp/playwright-full.log

exit $status
