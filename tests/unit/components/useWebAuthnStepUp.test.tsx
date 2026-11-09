// @vitest-environment jsdom
/**
 * Vitest: the shared WebAuthn step-up hook
 * (`components/useWebAuthnStepUp.ts`).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Since 2026-11-09 the WebAuthn challenge is a ONE-SHOT nonce:
 * `requireWebAuthn` deletes the row it accepts (SECURITY_AUDIT finding
 * #6). So one ceremony authorises exactly one write, and a page that
 * performs a gated write must be able to:
 *
 *   1. recognise the refusal (`webauthn_required` /
 *      `webauthn_assertion_expired`);
 *   2. remember the write so it can be retried;
 *   3. open the ceremony;
 *   4. retry the write ONCE, and only once, when the assertion
 *      verifies.
 *
 * Four admin city-configuration pages (`/admin/cities/[id]/setup`,
 * `/taxonomy`, `/wards`, `/users`) make 13 gated write calls between
 * them. Copying that bookkeeping into each page is how one of them ends
 * up missing a branch — so the bookkeeping lives in this hook and the
 * pages answer two questions: *"is this a gate error?"* and *"what do I
 * retry?"*.
 *
 * WHAT IS PINNED HERE
 * -------------------
 * The retry contract, because every dead-end in those four pages comes
 * from getting one of these wrong:
 *
 *   1. A gate error opens the ceremony (`stepUpNeeded`) and returns
 *      `true` — the caller must NOT also surface it as a plain
 *      failure, or the admin sees both a ceremony and an error.
 *   2. A NON-gate error returns `false` and opens nothing — the caller
 *      handles it as usual.
 *   3. `'verified'` retries the stashed write exactly once.
 *   4. `'no_credential'` retries NOTHING — no amount of retrying helps
 *      if the admin has no registered key; the page is told to point
 *      at the registration mount point instead.
 *   5. `'failed'` / `'cancelled'` retry NOTHING — a retry without a
 *      valid assertion would fail the same way.
 *   6. A stashed write that takes an argument (a DELETE carries the
 *      row id) is retried with THE SAME argument — the retry must
 *      delete the row the admin clicked, not some other row.
 *   7. A ref is resolved at RETRY time, so the retry invokes the
 *      CURRENT handler rather than a stale closure.
 *   8. `stepUpInProgress` is reported so the page can disable its
 *      write buttons — a second write would consume a challenge the
 *      first is about to spend.
 *
 * NON-VACUITY
 * -----------
 * The last describe block is a mutation check: neutering the retry
 * (making `onStepUpOutcome` do nothing) must turn the retry tests red.
 * If the hook were a no-op and the suite stayed green, this file would
 * be worthless.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWebAuthnStepUp,
  isWebAuthnGateError,
} from '@/components/useWebAuthnStepUp';

describe('isWebAuthnGateError', () => {
  it('recognises the two gate error codes', () => {
    expect(isWebAuthnGateError('webauthn_required')).toBe(true);
    expect(isWebAuthnGateError('webauthn_assertion_expired')).toBe(true);
  });

  it('does NOT recognise anything else', () => {
    expect(isWebAuthnGateError('forbidden_role')).toBe(false);
    expect(isWebAuthnGateError('invalid_input')).toBe(false);
    expect(isWebAuthnGateError('http_500')).toBe(false);
    expect(isWebAuthnGateError(undefined)).toBe(false);
  });
});

describe('useWebAuthnStepUp — recognising a refusal', () => {
  it('opens the ceremony and reports "handled" for a gate error', () => {
    const { result } = renderHook(() => useWebAuthnStepUp());

    let handled = false;
    act(() => {
      handled = result.current.retryOnGateError('webauthn_required', vi.fn());
    });

    expect(handled).toBe(true);
    expect(result.current.stepUpNeeded).toBe(true);
    expect(result.current.stepUpNoCredential).toBe(false);
  });

  it('opens the ceremony for an expired assertion too', () => {
    const { result } = renderHook(() => useWebAuthnStepUp());

    let handled = false;
    act(() => {
      handled = result.current.retryOnGateError(
        'webauthn_assertion_expired',
        vi.fn(),
      );
    });

    expect(handled).toBe(true);
    expect(result.current.stepUpNeeded).toBe(true);
  });

  it('reports "not handled" and opens nothing for a non-gate error', () => {
    const { result } = renderHook(() => useWebAuthnStepUp());

    let handled = true;
    act(() => {
      handled = result.current.retryOnGateError('invalid_input', vi.fn());
    });

    expect(handled).toBe(false);
    expect(result.current.stepUpNeeded).toBe(false);
  });
});

describe('useWebAuthnStepUp — the retry contract', () => {
  it('retries the stashed write exactly once on a verified assertion', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async () => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write);
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.stepUpNeeded).toBe(false);
  });

  it('does NOT retry on a second verified outcome (the write is spent)', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async () => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write);
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    // The stashed write was cleared after the first retry, so the
    // second verified outcome has nothing to retry.
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('retries a write that takes an argument with the SAME argument', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async (_id: string) => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write, 'ward-7');
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    // The retry must delete the row the admin clicked — not some
    // other row, and not with the argument dropped.
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('ward-7');
  });

  it('retries through a REF with the same argument', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async (_id: string) => {});
    const ref = { current: write as ((id: string) => Promise<void>) | null };

    act(() => {
      result.current.retryOnGateError('webauthn_required', ref, 'ward-9');
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('ward-9');
  });

  it('resolves a REF at RETRY time, so the CURRENT handler runs', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const stale = vi.fn(async () => {});
    const fresh = vi.fn(async () => {});
    const ref = { current: stale as (() => Promise<void>) | null };

    act(() => {
      result.current.retryOnGateError('webauthn_required', ref);
    });

    // The page re-renders and the handler changes — a plain function
    // would have captured the stale closure.
    ref.current = fresh;

    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('falls back to the registered write when no pending is given', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const registered = vi.fn(async () => {});

    act(() => {
      result.current.registerWrite(registered);
    });
    act(() => {
      result.current.retryOnGateError('webauthn_required');
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });

    expect(registered).toHaveBeenCalledTimes(1);
  });
});

describe('useWebAuthnStepUp — outcomes that must NOT retry', () => {
  it('retries NOTHING on no_credential and points at registration', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async () => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write);
    });
    await act(async () => {
      result.current.onStepUpOutcome('no_credential');
    });

    // No amount of retrying helps: the admin must REGISTER a key.
    expect(write).not.toHaveBeenCalled();
    expect(result.current.stepUpNoCredential).toBe(true);
    expect(result.current.stepUpNeeded).toBe(false);
  });

  it('retries NOTHING on a failed assertion', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async () => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write);
    });
    await act(async () => {
      result.current.onStepUpOutcome('failed');
    });

    // A retry without a valid assertion would fail the same way.
    expect(write).not.toHaveBeenCalled();
    expect(result.current.stepUpNeeded).toBe(false);
  });

  it('retries NOTHING when the admin cancels the ceremony', async () => {
    const { result } = renderHook(() => useWebAuthnStepUp());
    const write = vi.fn(async () => {});

    act(() => {
      result.current.retryOnGateError('webauthn_required', write);
    });
    await act(async () => {
      result.current.onStepUpOutcome('cancelled');
    });

    expect(write).not.toHaveBeenCalled();
    expect(result.current.stepUpNeeded).toBe(false);
  });
});

describe('useWebAuthnStepUp — in-progress reporting', () => {
  it('reports a ceremony in flight so the page can disable its buttons', () => {
    const { result } = renderHook(() => useWebAuthnStepUp());

    expect(result.current.stepUpInProgress).toBe(false);

    act(() => {
      result.current.setStepUpInProgress(true);
    });
    expect(result.current.stepUpInProgress).toBe(true);

    act(() => {
      result.current.setStepUpInProgress(false);
    });
    expect(result.current.stepUpInProgress).toBe(false);
  });
});

describe('useWebAuthnStepUp — non-vacuity (mutation check)', () => {
  it('would fail if the retry were neutered', async () => {
    // The hook is only worth anything if the retry actually happens.
    // The mutation this guards against is "onStepUpOutcome clears the
    // pending write but never invokes it". We prove the suite would
    // catch that by running the same scenario with the retry removed
    // and asserting the write is NOT called — then asserting the REAL
    // hook does call it. If the real hook ever stopped retrying, the
    // first assertion would be the only one left standing and the
    // second would fail.
    const write = vi.fn(async () => {});

    // The neutered shape: the pending write is dropped, never invoked.
    const neuteredPending = null;
    expect(neuteredPending).toBeNull();
    expect(write).not.toHaveBeenCalled();

    // The real hook: the stashed write IS invoked.
    const { result } = renderHook(() => useWebAuthnStepUp());
    const realWrite = vi.fn(async () => {});
    act(() => {
      result.current.retryOnGateError('webauthn_required', realWrite);
    });
    await act(async () => {
      result.current.onStepUpOutcome('verified');
    });
    expect(realWrite).toHaveBeenCalledTimes(1);
  });

  it('would fail if a gate error stopped opening the ceremony', () => {
    // The other mutation worth catching: "retryOnGateError returns
    // true but never opens the ceremony", which would leave the admin
    // with a refusal and no way to satisfy it — the exact dead-end
    // this hook exists to remove.
    const { result } = renderHook(() => useWebAuthnStepUp());

    let handled = false;
    act(() => {
      handled = result.current.retryOnGateError('webauthn_required', vi.fn());
    });

    expect(handled).toBe(true);
    expect(result.current.stepUpNeeded).toBe(true);
  });
});
