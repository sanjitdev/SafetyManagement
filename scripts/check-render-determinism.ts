/**
 * Render determinism probe (scripts/check-render-determinism.ts).
 *
 * Renders the seeded timestamps through the shared formatters and
 * prints them. Two runs — on different host timezones, or at different
 * wall-clock times — must print identical output.
 *
 *   CITYFIX_SEED_NOW=2026-11-06T09:44:00.000Z ./node_modules/.bin/tsx scripts/check-render-determinism.ts
 */

process.env.CITYFIX_DEV_STORE = '1';

async function main() {
  const { getStore } = await import('../lib/dev-store');
  const { formatTimestamp, formatTimestampShort } = await import(
    '../lib/format/datetime'
  );

  const store = getStore();
  console.log('--- audit (en) ---');
  for (const a of store.audit) {
    console.log(`${a.id}  ${formatTimestamp(a.timestamp, 'en')}`);
  }
  console.log('--- audit (bn) ---');
  for (const a of store.audit) {
    console.log(`${a.id}  ${formatTimestamp(a.timestamp, 'bn')}`);
  }
  console.log('--- tickets (short) ---');
  for (const t of store.tickets.values()) {
    console.log(`${t.id}  ${formatTimestampShort(t.createdAt, 'en')}`);
  }
}

void main();
