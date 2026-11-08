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
# The Playwright image pins the browser build that matches the installed
# `@playwright/test` version, so running here is the same browser CI runs.
#
# USAGE
#   (cat src.tar.gz nm.tar.gz) | MSYS_NO_PATHCONV=1 docker run --rm -i \
#     mcr.microsoft.com/playwright:v1.63.0-noble \
#     bash -c 'tar -xzf - -C /tmp && tar -xzf - -C /tmp && \
#              cd /tmp && bash scripts/run-specs-in-container.sh'
#
# The repo is streamed in over stdin as two GZIP tar archives (source, then
# node_modules), because a volume mount of the working directory is not
# permitted in this environment.
#
# The command string extracts BOTH archives and then runs the extracted
# copy of this script. It cannot be `bash /tmp/scripts/run-specs-in-container.sh`
# — that path does not exist until the archive has been extracted, so bash
# would fail before a single byte was unpacked. For the same reason this
# script does NOT extract its own input: by the time it runs, stdin is
# already consumed.

set -uo pipefail

cd /tmp || exit 1

export CI=1
export CITYFIX_DEV_STORE=1
export DEV_SKIP_WEBAUTHN=1

echo "=== node / playwright versions ==="
node --version
npx playwright --version 2>&1 | tail -1

# The Prisma client was generated on the host (Windows) and its Query Engine
# binary is platform-specific. Without this the dev server logs
# "PrismaClientInitializationError: could not locate the Query Engine for
# runtime debian-openssl-3.0.x" on every request that touches the database
# facade, and the route specs fail for that reason rather than their own.
echo "=== prisma generate (linux query engine) ==="
npx prisma generate 2>&1 | tail -5

echo
echo "=== test list ==="
npx playwright test --list 2>&1 | tail -15

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
npx playwright test --grep-invert 'CityFix mockup baselines' "$@" 2>&1 | tail -150

exit "${PIPESTATUS[0]}"
