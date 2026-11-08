#!/bin/bash
# Stream the archive into the Playwright container and run the route specs.
set -uo pipefail

cd "C:/ZDrive Folders/E2E_Training/SafetyManagement"

cat /tmp/cf-archive/combined.tar.gz | MSYS_NO_PATHCONV=1 docker run --rm -i \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'tar -xzf - -C /tmp && cd /tmp && \
           bash scripts/run-specs-in-container.sh'
