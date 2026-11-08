#!/bin/bash
# Run the two-spec baseline diagnostic in the container and leave the
# diff images in the host directory <repo>/tests-mockups/diffs.
#
# The output directory is INSIDE the repo rather than /tmp: a Docker
# bind-mount of a Git-Bash /tmp path does not land where the shell
# expects it on Windows, so the images end up in a place the shell
# cannot see.
set -uo pipefail
cd "C:/ZDrive Folders/E2E_Training/SafetyManagement"

OUT="C:/ZDrive Folders/E2E_Training/SafetyManagement/tests-mockups/diffs"
rm -rf "$OUT"
mkdir -p "$OUT"

cat /tmp/cf-archive/combined.tar.gz | MSYS_NO_PATHCONV=1 docker run --rm -i \
  -v "$OUT:/diffs" \
  -e DIFF_OUT=/diffs \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'tar -xzf - -C /tmp && cd /tmp && bash scripts/diag-two-baselines.sh'
