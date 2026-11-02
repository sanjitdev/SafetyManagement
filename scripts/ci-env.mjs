import { spawnSync } from 'node:child_process';

/**
 * Run a command with the exact environment the CI workflow uses.
 *
 * WHY THIS EXISTS
 * ---------------
 * `.github/workflows/ci.yml` runs the whole gate against an in-memory
 * dev store with a LOOPBACK `DATABASE_URL`:
 *
 *   CITYFIX_DEV_STORE=1
 *   DATABASE_URL=postgresql://cityfix:cityfix@localhost:5432/cityfix
 *   SESSION_SECRET=ci-placeholder-session-secret-not-a-real-credential
 *   WEBAUTHN_RP_ID=localhost
 *   WEBAUTHN_RP_ORIGIN=http://localhost:3000
 *   OTP_PROVIDER=stub
 *
 * Reproducing that locally is the only honest way to know the unit
 * suite and the production build survive it. It is how the module-load
 * database guard was caught: it threw during `next build`'s page-data
 * collection and during any unit test that flipped `NODE_ENV=production`
 * and re-imported a module reaching `lib/db.ts`.
 *
 * Usage:
 *   node scripts/ci-env.mjs npm run test:unit
 *   node scripts/ci-env.mjs npx next build
 */
const env = {
  ...process.env,
  CITYFIX_DEV_STORE: '1',
  DATABASE_URL: 'postgresql://cityfix:cityfix@localhost:5432/cityfix',
  SESSION_SECRET: 'ci-placeholder-session-secret-not-a-real-credential',
  WEBAUTHN_RP_ID: 'localhost',
  WEBAUTHN_RP_ORIGIN: 'http://localhost:3000',
  OTP_PROVIDER: 'stub',
  NEXT_TELEMETRY_DISABLED: '1',
};

const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  console.error('Usage: node scripts/ci-env.mjs <command> [...args]');
  process.exit(2);
}

const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
