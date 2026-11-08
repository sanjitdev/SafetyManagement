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
#
# WHY A TEMP FILE AND NOT A PIPE
# -----------------------------
# `tar -tzf ... | grep -qF <needle>` is a FALSE NEGATIVE under
# `set -euo pipefail`. `grep -q` exits the moment it finds a match,
# closing the pipe; `tar` then dies of SIGPIPE (exit 141 = 128+13).
# `pipefail` reports the RIGHTMOST non-zero exit, so the pipeline
# "fails" with 141 even though grep matched — and this script would
# report MISS for a needle that is present.
#
# It is not theoretical: this exact loop reported MISS for
# node_modules/.bin/playwright on an archive that demonstrably
# contained it. Writing the listing to a file first removes the pipe.
tar -tzf "$STAGE/combined.tar.gz" > "$STAGE/listing.txt"
for needle in 'node_modules/.bin/playwright' 'node_modules/.bin/prisma' 'node_modules/@node-rs/argon2/package.json' 'package.json' 'scripts/run-specs-in-container.sh'; do
  if grep -qF "$needle" "$STAGE/listing.txt"; then
    echo "OK   $needle"
  else
    echo "MISS $needle"
    exit 1
  fi
done
rm -f "$STAGE/listing.txt"
