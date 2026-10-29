/**
 * Load `.env.local` into `process.env` for a child command.
 *
 * WHY THIS EXISTS
 * ---------------
 * Next.js loads `.env.local` automatically when it boots the app, so the
 * running dev server always sees the right `DATABASE_URL`. The **Prisma
 * CLI does not** — `prisma migrate deploy`, `prisma db push` and
 * `prisma studio` only read `.env` and `.env.<NODE_ENV>`. With no `.env`
 * in the repo (the repo gitignores `.env*`), every `npm run db:*` command
 * failed with:
 *
 *     Error code: P1012
 *     error: Environment variable not found: DATABASE_URL.
 *
 * So the Prisma CLI could not talk to the local Postgres that the app
 * itself was happily using.
 *
 * This wrapper reads `.env.local` (the file Next.js already uses) and
 * spawns the requested command with the variables in its environment. One
 * source of truth for local env — no second `.env` to keep in sync, and
 * no risk of the CLI and the app pointing at different databases.
 *
 * USAGE
 *   node scripts/load-env-local.mjs <command> [args...]
 *
 *   node scripts/load-env-local.mjs npx prisma migrate deploy
 *   node scripts/load-env-local.mjs npx prisma studio
 *
 * Notes:
 *   - Values already present in `process.env` WIN. That is what lets CI
 *     (and any one-off override) pass `DATABASE_URL=... npx prisma ...`
 *     through the same script without the file clobbering it.
 *   - A missing `.env.local` is not an error; the command simply runs
 *     with whatever the caller already exported.
 *   - Production is unaffected: Vercel injects its own env vars and
 *     never runs this script.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(repoRoot, '.env.local');

/**
 * Parse a dotenv-style file. Handles the subset that matters here:
 * `KEY=value`, `KEY="value"`, `KEY='value'`, `#` comments and blank
 * lines. Deliberately not a full dotenv implementation — the repo has one
 * env file with one simple format.
 */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === '') continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const childEnv = { ...process.env };
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envFile, 'utf8')))) {
    // An explicit process env var wins over the file.
    if (childEnv[key] === undefined) childEnv[key] = value;
  }
}

const [, , ...command] = process.argv;
if (command.length === 0) {
  console.error('usage: node scripts/load-env-local.mjs <command> [args...]');
  process.exit(2);
}

const child = spawn(command[0], command.slice(1), {
  stdio: 'inherit',
  env: childEnv,
  shell: process.platform === 'win32',
});
child.on('error', (err) => {
  console.error(`failed to run "${command.join(' ')}": ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
