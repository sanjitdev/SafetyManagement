#!/bin/bash
# Why is node_modules/.bin/playwright not found by grep -F?
set -uo pipefail
ARCHIVE=/tmp/cf-archive/combined.tar.gz

echo "=== lines containing '.bin/playwright' (raw) ==="
tar -tzf "$ARCHIVE" | grep 'bin/playwright' | cat -A | head -5

echo "=== grep -F exact ==="
tar -tzf "$ARCHIVE" | grep -F 'node_modules/.bin/playwright' | head -5
echo "grep -F exit: $?"

echo "=== with -v verbose listing ==="
tar -tvzf "$ARCHIVE" | grep 'node_modules/.bin/playwright$' | head -5

echo "=== count ==="
tar -tzf "$ARCHIVE" | grep -c 'node_modules/.bin/'
