/**
 * Seed determinism probe (scripts/check-seed-determinism.ts).
 *
 * Prints the seeded timestamps so they can be compared across runs and
 * across host timezones. Two runs with the same `CITYFIX_SEED_NOW` must
 * print identical output — that is what makes a visual baseline
 * reproducible.
 *
 *   CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z ./node_modules/.bin/tsx scripts/check-seed-determinism.ts
 */

process.env.CITYFIX_DEV_STORE = '1';

async function main() {
  const { devDb, getStore } = await import('../lib/dev-store');

  const store = getStore();
  console.log('--- tickets ---');
  for (const t of store.tickets.values()) {
    console.log(`${t.id}  created=${t.createdAt}  updated=${t.updatedAt}`);
  }
  console.log('--- audit ---');
  for (const a of store.audit) {
    console.log(`${a.id}  timestamp=${a.timestamp}`);
  }
  console.log('--- devDb present ---');
  console.log(typeof devDb.ticket.findMany);
}

void main();
