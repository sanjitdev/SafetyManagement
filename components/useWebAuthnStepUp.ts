/**
 * The WebAuthn step-up hook (components/useWebAuthnStepUp.ts).
 *
 * ADR-007 ("admin write paths require WebAuthn") gates every admin
 * write behind a fresh WebAuthn assertion. The guard is enforced
 * server-side by `requireWebAuthn`; this hook is the **client half**
 * that lets a signed-in admin satisfy it.
 *
 * **The problem this hook solves.** Since 2026-11-09 the WebAuthn
 * challenge is a one-shot nonce — `requireWebAuthn` DELETES the row
 * it accepts, so one ceremony authorises exactly one write (SECURITY_AUDIT
 * finding #6). Before that, one ceremony covered five minutes of
 * writes and a page only had to prompt once. Now **every** gated write
 * needs its own ceremony, so every page that performs one has to:
 *
 *   1. recognise the refusal (401 `webauthn_required` or
 *      `webauthn_assertion_expired`);
 *   2. remember the write so it can be retried;
 *   3. open the ceremony;
 *   4. retry the write once — and only once — the assertion verifies.
 *
 * Doing that by hand in each page means copying four pieces of state
 * and a retry function. This hook holds that state once, so a page
 * only has to answer two questions: *"is this error a gate error?"*
 * and *"what should I retry?"*.
 *
 * **Why a hook and not a component.** The ceremony UI
 * (`AdminWebAuthnStepUp`) is a component because it renders. The
 * retry bookkeeping is not — it is state and callbacks, and the page
 * already owns the layout where the panel should appear. So the
 * component stays where it was and the state moves here.
 *
 * **The retry contract.** `retryOnGateError` is called with the
 * error code and the write to remember:
 *
 * ```ts
 * const res = await fetch(url, opts);
 * if (!res.ok) {
 *   const body = await res.json();
 *   if (stepUp.retryOnGateError(body.error, () => doTheWrite())) return;
 *   setError(body.error);
 * }
 * ```
 *
 * On a gate error it stashes the write and opens the ceremony, and
 * returns `true` so the caller knows the error was handled and must
 * not also surface it as a plain failure. On anything else it returns
 * `false` and the caller handles the error as usual.
 *
 * On `'verified'` the stashed write runs exactly once. On
 * `'no_credential'` nothing is retried — no amount of retrying helps
 * if the admin has no registered key — and the page is told to point
 * at the registration mount point. On `'failed'` / `'cancelled'`
 * nothing is retried either: a retry without a valid assertion would
 * fail the same way.
 */

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { StepUpOutcome } from './AdminWebAuthnStepUp';

/**
 * The error codes that mean "run the step-up ceremony, then retry".
 *
 * `webauthn_required` — the admin has no registered credential, or has
 * one but no fresh challenge. `webauthn_assertion_expired` — the admin
 * HAS a credential but the challenge is stale, so a new assertion is
 * needed. Both are satisfied by the same ceremony; the difference is
 * only in whether the admin must REGISTER a key first, which the
 * ceremony reports as the `no_credential` outcome.
 */
export function isWebAuthnGateError(code: string | undefined): boolean {
  return code === 'webauthn_required' || code === 'webauthn_assertion_expired';
}

/**
 * A write that can be retried once the assertion verifies.
 *
 * Most writes take no arguments (save, create). A few take one — a
 * DELETE carries the id of the row being removed. The generic keeps
 * both shapes honest: `retryOnGateError` accepts a writer of any
 * argument list, and the stashed retry re-invokes it with the SAME
 * arguments the failed attempt used.
 */
export type PendingWrite<Args extends unknown[] = []> = (
  ...args: Args
) => Promise<void>;

/**
 * A ref holding a pending write. The ref is resolved at RETRY time,
 * so the retry always invokes the current handler rather than a stale
 * closure captured when the error was raised.
 */
export type PendingWriteRef<Args extends unknown[] = []> =
  React.MutableRefObject<PendingWrite<Args> | null>;

export interface WebAuthnStepUpState {
  /**
   * The ceremony should be visible: either a write was refused and is
   * waiting for an assertion, or the admin has no credential and must
   * register one.
   */
  stepUpNeeded: boolean;
  /**
   * The admin has no registered credential. The page should point at
   * the registration mount point (`AdminSecurityKey`, on `/admin`)
   * rather than asking for a retry.
   */
  stepUpNoCredential: boolean;
  /**
   * A ceremony is in flight. The page uses this to disable the write
   * buttons so the admin cannot fire two writes at once — the second
   * would consume a challenge the first is about to spend.
   */
  stepUpInProgress: boolean;
  /**
   * Report that a ceremony started or finished. The page passes this
   * straight to `AdminWebAuthnStepUp`'s `onStateChange`.
   */
  setStepUpInProgress: (inProgress: boolean) => void;
  /**
   * Handle a failed write. Returns `true` when the error was a gate
   * error (the ceremony is now open and the write is stashed), and
   * `false` when it was anything else (the caller should surface it).
   *
   * @param code    the error code from the API response
   * @param pending the write to retry once the assertion verifies.
   *                Either a plain function, or a ref holding one — a
   *                ref is resolved at retry time, so the handler is
   *                always the current one. A writer that takes
   *                arguments (a DELETE carrying the row id) is
   *                re-invoked with the same arguments.
   */
  retryOnGateError: <Args extends unknown[] = []>(
    code: string | undefined,
    pending?: PendingWrite<Args> | PendingWriteRef<Args>,
    ...args: Args
  ) => boolean;
  /**
   * Register the page's own write handler so the retry can call it.
   *
   * A page's write handler is a `useCallback` that cannot reference
   * itself — `useCallback(() => … useCallback(…))` is a circular
   * dependency React's lint rules reject, and a plain self-reference
   * captures a stale binding. So the page hands the hook a ref
   * instead:
   *
   * ```ts
   * const handleSave = useCallback(async () => {
   *   …
   *   if (stepUp.retryOnGateError(body.error, handleSaveRef)) return;
   *   …
   * }, […]);
   * handleSaveRef.current = handleSave;
   * ```
   *
   * `retryOnGateError` then takes the ref *or* a plain function —
   * whichever is convenient.
   */
  registerWrite: (write: () => Promise<void>) => void;
  /**
   * The ceremony's outcome handler. The page passes this straight to
   * `AdminWebAuthnStepUp`'s `onOutcome`.
   */
  onStepUpOutcome: (outcome: StepUpOutcome) => void;
}

export function useWebAuthnStepUp(): WebAuthnStepUpState {
  const [stepUpNeeded, setStepUpNeeded] = useState(false);
  const [stepUpNoCredential, setStepUpNoCredential] = useState(false);
  const [stepUpInProgress, setStepUpInProgressState] = useState(false);
  const pendingWriteRef = useRef<(() => Promise<void>) | null>(null);
  /**
   * The page's own write handler, registered each render. The retry
   * calls through this ref so it always invokes the CURRENT handler
   * rather than a stale closure captured when the error was raised.
   */
  const writeRef = useRef<(() => Promise<void>) | null>(null);

  const registerWrite = useCallback((write: () => Promise<void>) => {
    writeRef.current = write;
  }, []);

  const setStepUpInProgress = useCallback((inProgress: boolean) => {
    setStepUpInProgressState(inProgress);
  }, []);

  /**
   * The gate handler is stable across renders so a page can list it
   * in a `useCallback` dependency array without re-creating its write
   * handlers on every render.
   */
  const retryOnGateError = useCallback(
    <Args extends unknown[] = []>(
      code: string | undefined,
      pending?: PendingWrite<Args> | PendingWriteRef<Args>,
      ...args: Args
    ): boolean => {
      if (!isWebAuthnGateError(code)) return false;
      // Remember the write so the ceremony can retry it. A ref is
      // resolved at retry time (so the handler is current); a plain
      // function is captured as-is. Either way the arguments the
      // failed attempt used are carried over, so a DELETE retries the
      // same row.
      const invoke = (writer: PendingWrite<Args> | null) =>
        writer ? writer(...args) : Promise.resolve();
      pendingWriteRef.current =
        pending && 'current' in pending
          ? () => invoke(pending.current)
          : pending
            ? () => invoke(pending)
            : () => writeRef.current?.() ?? Promise.resolve();
      setStepUpNeeded(true);
      setStepUpNoCredential(false);
      return true;
    },
    [],
  );

  const onStepUpOutcome = useCallback((outcome: StepUpOutcome) => {
    if (outcome === 'verified') {
      setStepUpNeeded(false);
      setStepUpNoCredential(false);
      const retry = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (retry) void retry();
      return;
    }
    if (outcome === 'no_credential') {
      // No amount of retrying helps: the admin must REGISTER a key.
      setStepUpNoCredential(true);
      setStepUpNeeded(false);
      pendingWriteRef.current = null;
      return;
    }
    // 'failed' | 'cancelled' — close the ceremony. The component
    // renders its own error line.
    setStepUpNeeded(false);
    pendingWriteRef.current = null;
  }, []);

  /**
   * The returned object is memoised so its identity is stable across
   * renders. A page can therefore list `stepUp` in a `useCallback`
   * dependency array without re-creating its write handlers on every
   * render, and `react-hooks/exhaustive-deps` is satisfied.
   */
  return useMemo(
    () => ({
      stepUpNeeded,
      stepUpNoCredential,
      stepUpInProgress,
      setStepUpInProgress,
      retryOnGateError,
      registerWrite,
      onStepUpOutcome,
    }),
    [
      stepUpNeeded,
      stepUpNoCredential,
      stepUpInProgress,
      setStepUpInProgress,
      retryOnGateError,
      registerWrite,
      onStepUpOutcome,
    ],
  );
}
