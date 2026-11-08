#!/bin/bash
# Finish the archive: gzip the merged tar and verify the result.
set -euo pipefail
STAGE=/tmp/cf-archive

echo "=== entries before gzip ==="
tar -tf "$STAGE/base.tar" | wc -l

echo "=== gzip ==="
gzip -f "$STAGE/base.tar"
mv "$STAGE/base.tar.gz" "$STAGE/combined.tar.gz"

echo "combined size: $(du -h "$STAGE/combined.tar.gz" | cut -f1)"

echo "=== entries from the gzip ==="
count=$(tar -tzf "$STAGE/combined.tar.gz" | wc -l)
echo "$count"

echo "=== assert the essentials are present ==="
for needle in 'node_modules/.bin/playwright' 'node_modules/.bin/prisma' 'node_modules/@node-rs/argon2/package.json' 'package.json' 'scripts/run-specs-in-container.sh'; do
  if tar -tzf "$STAGE/combined.tar.gz" | grep -qF "$needle"; then
    echo "OK   $needle"
  else
    echo "MISS $needle"
    exit 1
  fi
done
