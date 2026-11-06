/**
 * Materialise the OpenAPI specification as JSON.
 *
 * `lib/docs/openapi.ts` is the source of truth; this script writes its
 * serialised form to `lib/docs/openapi.json` for external tooling that
 * wants a file rather than a URL.
 *
 * Run with `npm run docs:generate`. Re-running it with no source change
 * must leave `git diff` empty — that is the drift check.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openapiSpec } from '../lib/docs/openapi';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(here, '..', 'lib', 'docs', 'openapi.json');

  const json = `${JSON.stringify(openapiSpec, null, 2)}\n`;
  await writeFile(outputPath, json, 'utf8');

  const pathCount = Object.keys(openapiSpec.paths).length;
  const operationCount = Object.values(openapiSpec.paths).reduce(
    (total, pathItem) =>
      total +
      ['get', 'post', 'put', 'patch', 'delete'].filter(
        (method) => method in pathItem,
      ).length,
    0,
  );

  process.stdout.write(
    `Wrote ${outputPath}\n  ${pathCount} paths, ${operationCount} operations\n`,
  );
}

void main();
