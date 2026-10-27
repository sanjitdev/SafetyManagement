/**
 * Unit tests for the WebAuthn credential write path in
 * `lib/db-switch.ts` (`db.userWebAuthn`).
 *
 * Bolt 005-001: admin writes are WebAuthn-gated. The credential
 * ledger lives on the `User` row (`webAuthnCredentials` /
 * `webAuthnChallenge`).
 *
 * Covered:
 *   - `writeCredentials` — persists the credential list on the row.
 *   - `readCredentials` — reads it back, and returns nulls for a
 *     user that has none.
 *   - `writeChallenge` — persists the pending challenge.
 *   - `bumpCounter` — updates the counter on the matching credential
 *     and leaves the others alone.
 *   - `webAuthnChallenge.create` / `findById` — the challenge
 *     ledger, including the `userId: ''` id-only lookup path.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/lib/db-switch';
import { resetStore, getStore, DEV_ADMIN_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

const CREDENTIAL = {
  credentialID: 'cred_1',
  publicKey: 'pk_1',
  counter: 0,
  transports: ['internal'],
};

describe('db.userWebAuthn.writeCredentials / readCredentials', () => {
  it('persists the credential list on the user row', async () => {
    await db.userWebAuthn.writeCredentials(DEV_ADMIN_ID, [CREDENTIAL]);

    const stored = getStore().users.get(DEV_ADMIN_ID)?.webAuthnCredentials;
    expect(stored).toHaveLength(1);
    expect(stored?.[0]?.credentialID).toBe('cred_1');
  });

  it('reads the credentials back', async () => {
    await db.userWebAuthn.writeCredentials(DEV_ADMIN_ID, [CREDENTIAL]);

    const read = await db.userWebAuthn.readCredentials(DEV_ADMIN_ID);
    expect(read.webAuthnCredentials).toHaveLength(1);
    expect(read.webAuthnChallenge).toBeNull();
  });

  it('returns nulls for a user with no credentials', async () => {
    const read = await db.userWebAuthn.readCredentials('user_with_nothing');
    expect(read.webAuthnCredentials).toBeNull();
    expect(read.webAuthnChallenge).toBeNull();
  });
});

describe('db.userWebAuthn.writeChallenge', () => {
  it('persists the pending challenge', async () => {
    await db.userWebAuthn.writeChallenge(DEV_ADMIN_ID, { challenge: 'abc123' });

    const stored = getStore().users.get(DEV_ADMIN_ID)?.webAuthnChallenge;
    expect(stored).toEqual({ challenge: 'abc123' });
  });

  it('is visible through readCredentials', async () => {
    await db.userWebAuthn.writeChallenge(DEV_ADMIN_ID, { challenge: 'xyz' });

    const read = await db.userWebAuthn.readCredentials(DEV_ADMIN_ID);
    expect(read.webAuthnChallenge).toEqual({ challenge: 'xyz' });
  });
});

describe('db.userWebAuthn.bumpCounter', () => {
  it('updates the counter on the matching credential only', async () => {
    await db.userWebAuthn.writeCredentials(DEV_ADMIN_ID, [
      { ...CREDENTIAL, credentialID: 'cred_1', counter: 0 },
      { ...CREDENTIAL, credentialID: 'cred_2', counter: 5 },
    ]);

    await db.userWebAuthn.bumpCounter(DEV_ADMIN_ID, 'cred_1', 42);

    const stored = getStore().users.get(DEV_ADMIN_ID)?.webAuthnCredentials ?? [];
    expect(stored.find((c) => c.credentialID === 'cred_1')?.counter).toBe(42);
    expect(stored.find((c) => c.credentialID === 'cred_2')?.counter).toBe(5);
  });

  it('throws for an unknown user', async () => {
    await expect(
      db.userWebAuthn.bumpCounter('user_ghost', 'cred_1', 1),
    ).rejects.toThrow(/not found/);
  });
});

describe('db.webAuthnChallenge', () => {
  it('creates and reads back a challenge', async () => {
    const created = await db.webAuthnChallenge.create({
      userId: DEV_ADMIN_ID,
      challenge: 'challenge-value',
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
    });
    expect(created.id).toBeTruthy();

    const found = await db.webAuthnChallenge.findById({
      id: created.id,
      userId: DEV_ADMIN_ID,
    });
    expect(found?.challenge).toBe('challenge-value');
  });

  it('returns null for a challenge that belongs to another user', async () => {
    const created = await db.webAuthnChallenge.create({
      userId: DEV_ADMIN_ID,
      challenge: 'challenge-value',
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
    });
    const found = await db.webAuthnChallenge.findById({
      id: created.id,
      userId: 'someone_else',
    });
    expect(found).toBeNull();
  });

  it('resolves by id alone when userId is the empty string', async () => {
    const created = await db.webAuthnChallenge.create({
      userId: DEV_ADMIN_ID,
      challenge: 'challenge-value',
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
    });
    const found = await db.webAuthnChallenge.findById({
      id: created.id,
      userId: '',
    });
    expect(found?.id).toBe(created.id);
  });

  it('returns null for an unknown challenge id', async () => {
    const found = await db.webAuthnChallenge.findById({
      id: 'wbc_missing',
      userId: DEV_ADMIN_ID,
    });
    expect(found).toBeNull();
  });
});
