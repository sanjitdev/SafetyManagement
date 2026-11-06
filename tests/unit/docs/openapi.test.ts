/**
 * Vitest: integrity checks for the OpenAPI specification.
 *
 * The spec is a hand-written document, so the failure mode it has to
 * guard against is a *silently wrong* doc — a `$ref` that points at
 * nothing, a path parameter the operation never declares, a route
 * that is missing from the document entirely. None of those throw at
 * build time on their own; Swagger UI renders them as a blank panel
 * or an "unknown" chip and nobody notices.
 *
 * These tests assert the structural invariants that make the document
 * trustworthy, plus the two behavioural ones that matter to a client:
 * both docs endpoints answer 200 without a session.
 */

import { describe, expect, test } from 'vitest';
import { openapiSpec, openapiPaths } from '@/lib/docs/openapi';

type JsonObject = Record<string, unknown>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `$ref` string anywhere in the document. */
function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return out;
  }
  if (!isObject(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') out.push(value);
    else collectRefs(value, out);
  }
  return out;
}

/** The JSON pointer path segments a `#/a/b/c` ref resolves through. */
function refSegments(ref: string): string[] {
  return ref.replace(/^#\//, '').split('/');
}

/** Does a JSON pointer resolve inside the document? */
function refResolves(ref: string): boolean {
  const segments = refSegments(ref);
  if (segments[0] !== 'components') return false;
  let cursor: unknown = openapiSpec.components;
  for (const segment of segments.slice(1)) {
    if (!isObject(cursor)) return false;
    cursor = cursor[segment];
    if (cursor === undefined) return false;
  }
  return true;
}

/**
 * Resolve a parameter entry to its definition — a `$ref` points into
 * `components.parameters`, an inline object stands on its own.
 */
function resolveParameter(entry: unknown): JsonObject | null {
  if (!isObject(entry)) return null;
  if (typeof entry.$ref === 'string') {
    if (!refResolves(entry.$ref)) return null;
    const segments = refSegments(entry.$ref);
    let cursor: unknown = openapiSpec.components;
    for (const segment of segments.slice(1)) {
      if (!isObject(cursor)) return null;
      cursor = cursor[segment];
    }
    return isObject(cursor) ? cursor : null;
  }
  return entry;
}

/**
 * Resolve a response entry — a `$ref` points into `components.responses`,
 * an inline object stands on its own.
 */
function resolveResponse(entry: unknown): JsonObject | null {
  if (!isObject(entry)) return null;
  if (typeof entry.$ref === 'string') {
    if (!refResolves(entry.$ref)) return null;
    const segments = refSegments(entry.$ref);
    let cursor: unknown = openapiSpec.components;
    for (const segment of segments.slice(1)) {
      if (!isObject(cursor)) return null;
      cursor = cursor[segment];
    }
    return isObject(cursor) ? cursor : null;
  }
  return entry;
}

describe('the OpenAPI document', () => {
  test('declares OpenAPI 3.x', () => {
    expect(openapiSpec.openapi).toMatch(/^3\./);
  });

  test('has the required top-level fields', () => {
    expect(openapiSpec.info.title).toBeTruthy();
    expect(openapiSpec.info.version).toBeTruthy();
    expect(openapiSpec.servers.length).toBeGreaterThan(0);
    expect(openapiSpec.tags.length).toBeGreaterThan(0);
  });

  test('declares the session cookie security scheme', () => {
    const scheme = openapiSpec.components?.securitySchemes?.sessionCookie as JsonObject;
    expect(scheme).toBeDefined();
    expect(scheme.type).toBe('apiKey');
    expect(scheme.in).toBe('cookie');
    expect(scheme.name).toBe('cityfix_session');
  });

  test('the paths and the document agree', () => {
    expect(openapiSpec.paths).toBe(openapiPaths);
  });
});

describe('every path', () => {
  const entries = Object.entries(openapiPaths);

  test('there is at least one path', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test.each(entries)('%s declares at least one operation', (path) => {
    const pathItem = openapiPaths[path];
    const operations = METHODS.filter((method) => pathItem[method]);
    expect(operations.length).toBeGreaterThan(0);
  });

  test.each(entries)('%s starts with /api/', (path) => {
    expect(path.startsWith('/api/')).toBe(true);
  });

  test('no dev-only route is documented', () => {
    for (const [path] of entries) {
      expect(path.startsWith('/api/dev')).toBe(false);
    }
  });

  test.each(entries)(
    '%s declares every path placeholder as a path parameter',
    (path) => {
      const pathItem = openapiPaths[path];
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

      const declared = new Set<string>();
      for (const source of [pathItem.parameters ?? [], ...collectOperationParams(pathItem)]) {
        for (const entry of source) {
          const parameter = resolveParameter(entry);
          if (!parameter) continue;
          if (parameter.in === 'path' && typeof parameter.name === 'string') {
            declared.add(parameter.name);
          }
        }
      }

      for (const placeholder of placeholders) {
        expect(declared.has(placeholder)).toBe(true);
      }
    },
  );
});

describe('every operation', () => {
  const operations = Object.entries(openapiPaths).flatMap(([path, pathItem]) =>
    METHODS.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [[path, method, operation] as const] : [];
    }),
  );

  test('there are operations', () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  test.each(operations)('%s %s has a summary, an operationId and responses', (_path, _method, operation) => {
    expect(operation.summary).toBeTruthy();
    expect(operation.operationId).toBeTruthy();
    expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
  });

  test.each(operations)('%s %s has a unique operationId', (path, method, operation) => {
    const duplicate = operations.find(
      (other) =>
        other[2].operationId === operation.operationId &&
        !(other[0] === path && other[1] === method),
    );
    expect(duplicate).toBeUndefined();
  });

  test.each(operations)('%s %s declares at least one response description', (_path, _method, operation) => {
    for (const [status, response] of Object.entries(operation.responses)) {
      expect(status).toMatch(/^[1-5]\d\d$/);
      const resolved = resolveResponse(response);
      expect(resolved).not.toBeNull();
      expect(typeof resolved?.description).toBe('string');
    }
  });
});

describe('component references', () => {
  test('every $ref in the document resolves', () => {
    const refs = [...new Set(collectRefs(openapiSpec))];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect({ ref, resolves: refResolves(ref) }).toEqual({ ref, resolves: true });
    }
  });

  test('every schema in components.schemas is an object schema', () => {
    const schemas = openapiSpec.components?.schemas ?? {};
    for (const [name, schema] of Object.entries(schemas)) {
      expect(isObject(schema)).toBe(true);
      expect(typeof schema.type).toBe('string');
      expect(name).toBeTruthy();
    }
  });
});

describe('the docs endpoints', () => {
  test('GET /api/docs/spec answers 200 with the spec', async () => {
    const { GET } = await import('@/app/api/docs/spec/route');
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonObject;
    expect(body.openapi).toBe(openapiSpec.openapi);
    expect(Object.keys(body.paths as JsonObject).length).toBe(
      Object.keys(openapiPaths).length,
    );
  });

  test('GET /api/docs answers 200 with the Swagger UI mount point', async () => {
    const { GET } = await import('@/app/api/docs/route');
    const request = new Request('https://cityfix.test/api/docs') as never;
    const res = await GET(request);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('id="swagger-ui"');
    expect(html).toContain('swagger-ui-bundle.js');
    expect(html).toContain('/api/docs/spec');
  });

  test('the generated JSON artifact matches the source module', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const artifact = await readFile(
      resolve(process.cwd(), 'lib', 'docs', 'openapi.json'),
      'utf8',
    );
    expect(JSON.parse(artifact)).toEqual(JSON.parse(JSON.stringify(openapiSpec)));
  });

  /**
   * Next.js 14 reserves the `openapi` route segment for its OpenAPI
   * metadata-route convention. A handler at `app/api/docs/openapi/route.ts`
   * is silently never registered — the request 404s with no error and no
   * entry in the app-paths manifest. Renaming the directory to `spec`
   * fixes it, but the failure is invisible to the type checker and to
   * every route-level test, so it needs an explicit guard.
   */
  test('the spec route is not filed under the reserved `openapi` segment', async () => {
    const { access } = await import('node:fs/promises');
    const { resolve } = await import('node:path');

    const reserved = resolve(
      process.cwd(),
      'app',
      'api',
      'docs',
      'openapi',
      'route.ts',
    );
    await expect(access(reserved)).rejects.toThrow();

    const actual = resolve(
      process.cwd(),
      'app',
      'api',
      'docs',
      'spec',
      'route.ts',
    );
    await expect(access(actual)).resolves.toBeUndefined();
  });
});

/** The parameters declared by each operation on a path item. */
function collectOperationParams(pathItem: unknown): unknown[][] {
  const sources: unknown[][] = [];
  if (!isObject(pathItem)) return sources;
  for (const method of METHODS) {
    const operation = pathItem[method];
    if (!isObject(operation)) continue;
    const params = operation.parameters;
    if (Array.isArray(params)) {
      sources.push(params);
    }
  }
  return sources;
}
