/**
 * Request-scoped language store (lib/i18n/language-request-store.ts).
 *
 * A tiny, dependency-free channel that lets the SERVER tell a
 * synchronously-running client hook what language to render.
 *
 * WHY IT EXISTS
 * -------------
 * `components/useLanguage.ts` is a `'use client'` module, so Next.js
 * SERVER-RENDERS it too. Its `readStoredLanguage()` is synchronous (a
 * React state initialiser cannot await), which means it cannot call
 * `cookies()` from `next/headers` — that API is async, and
 * `next/headers` cannot be imported into a module that ships to the
 * browser.
 *
 * The root layout — a server component — CAN await. It reads the
 * language cookie and publishes it here before any child renders.
 * Every `readStoredLanguage()` call during that render then finds the
 * value synchronously, and the server's text matches the client's.
 *
 * WHY A GLOBAL, NOT A MODULE VARIABLE
 * ----------------------------------
 * The store has to be reachable from two modules that Next.js may
 * bundle SEPARATELY: the server-only priming module and the client
 * module that reads it. A plain module-level variable would be two
 * different variables in two different bundles. `globalThis` is one
 * object in one process, so both sides see the same slot.
 *
 * WHY IT IS SAFE ACROSS CONCURRENT REQUESTS
 * -----------------------------------------
 * The slot holds ONE value, and the server renders one request at a
 * time per React render pass — but a Node server DOES interleave
 * requests. To keep concurrent requests from reading each other's
 * language, the value is stored per-REQUEST using AsyncLocalStorage,
 * which is request-scoped by construction.
 *
 * The AsyncLocalStorage instance lives in the server-only module
 * (`lib/i18n/server-language.ts`); this module only holds the
 * `globalThis` bridge to it, which is what lets a client-safe module
 * reach it without importing `node:async_hooks` itself.
 *
 * THIS MODULE IS SAFE IN THE BROWSER — it has no Node-only imports and
 * no side effects. On the client the bridge is simply unused, because
 * the client reads `document.cookie` directly.
 */

/** The key under which the request-scoped resolver is published. */
const RESOLVER_KEY = '__cityfixRequestLanguageResolver';

/**
 * The resolver interface the server publishes.
 *
 * `resolve()` returns the language for the CURRENT request, or null if
 * the request has not been primed.
 */
export interface RequestLanguageResolver {
  resolve(): string | null;
}

interface BridgeHost {
  [RESOLVER_KEY]?: RequestLanguageResolver;
}

/**
 * Publish the request-scoped resolver. Called from the server module.
 */
export function setRequestLanguageResolver(resolver: RequestLanguageResolver): void {
  (globalThis as BridgeHost)[RESOLVER_KEY] = resolver;
}

/**
 * Resolve the language for the current request, or null when the
 * server has not primed it (or when running in the browser).
 */
export function resolveRequestLanguage(): string | null {
  const host = globalThis as BridgeHost;
  const resolver = host[RESOLVER_KEY];
  if (!resolver) return null;
  try {
    return resolver.resolve();
  } catch {
    return null;
  }
}
