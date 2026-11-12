/**
 * OpenAPI 3.0.3 specification for the CityFix API.
 *
 * This module is the single source of truth for the API contract.
 * It is imported by:
 *   - `app/api/docs/openapi/route.ts` → serves it as JSON at /api/docs/openapi.json
 *   - `app/api/docs/route.ts`        → the Swagger UI page points at that URL
 *   - `scripts/generate-openapi.ts`   → writes lib/docs/openapi.json
 *
 * WHY A TS MODULE AND NOT A YAML/JSON FILE
 * ---------------------------------------
 * A hand-written YAML spec drifts from the routes silently: nothing
 * fails when a field name changes in a route handler, the doc just
 * becomes wrong. Here the spec is a typed object, so `tsc --noEmit`
 * catches a malformed component reference or a typo'd discriminator
 * at build time. `npm run docs:generate` then materialises it as JSON
 * for external tooling that wants a file rather than a URL.
 *
 * ACCURACY RULES FOR THIS FILE
 * ----------------------------
 * 1. Every path, method, status code and error code here was read
 *    from the corresponding route file. Where a route's own docblock
 *    disagrees with its code, THE CODE WINS — several docblocks in
 *    this repo are stale (e.g. `POST /api/tickets`'s header claims
 *    the dedup body carries `existing_ticket`, but the code returns
 *    a flat `existing_ticket_id`).
 * 2. The API is NOT internally consistent, and the spec must not
 *    pretend it is. The known divergences are documented inline
 *    rather than normalised away, because clients already depend on
 *    the current behaviour:
 *      - unauthenticated code: `not_authenticated` everywhere except
 *        /api/v1/admin/** and /api/profile, which use `unauthenticated`
 *      - input-error code: `invalid_query` on the dispatcher/crew list
 *        routes vs `invalid_input` on admin routes and body routes
 *      - rate-limit field: `retryAfterMs` on most routes but
 *        `retry_after_ms` on GET /api/tickets/{id}
 *      - illegal transition: 409 `invalid_transition` on
 *        /api/tickets/{id}/transition vs 422 `illegal_transition` on
 *        the v1 dispatcher/crew transition routes
 * 3. Endpoints that return 401 with the guard's raw error *message*
 *    (rather than a stable code) are documented with the code the
 *    guard throws, since the message equals the code in practice
 *    (`ApiError` sets `message = code` when no message is supplied).
 * 4. Rule 1 is now ENFORCED, not just asserted.
 *    `tests/unit/docs/openapi-route-parity.test.ts` reads every
 *    `app/api/**\/route.ts` from disk, extracts its exported HTTP
 *    methods, and compares them against this document in both
 *    directions. A documented operation with no handler, or a handler
 *    with no documented operation, fails the unit suite.
 *
 *    This was added on 2026-11-08 after the production-readiness audit
 *    found the pair of phantom operations on `/api/tickets/{id}` that
 *    rule 1 was supposed to prevent — `tsc --noEmit` cannot catch a
 *    documented method with no handler behind it, because the type
 *    checker validates that a component reference is well-formed, not
 *    that a documented operation exists.
 */

/**
 * Minimal structural types for the subset of OpenAPI 3.0.3 this
 * project uses. A local type keeps `openapi-types` out of the
 * dependency tree for what is a type-only need.
 */
type JsonSchema = Record<string, unknown>;

interface Ref {
  $ref: string;
}
type MaybeRef<T> = T | Ref;

interface OpenApiObject {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    license?: { name: string; identifier?: string };
  };
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, JsonSchema>;
    responses?: Record<string, Response>;
    parameters?: Record<string, Parameter>;
  };
  security?: Array<Record<string, string[]>>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Array<MaybeRef<Parameter>>;
}

interface Operation {
  tags?: string[];
  summary: string;
  description?: string;
  operationId: string;
  parameters?: Array<MaybeRef<Parameter>>;
  requestBody?: MaybeRef<RequestBody>;
  responses: Record<string, MaybeRef<Response>>;
  security?: Array<Record<string, string[]>>;
}

interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: JsonSchema;
  example?: unknown;
}

interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: JsonSchema }>;
}

interface Response {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
  headers?: Record<string, { description: string; schema: JsonSchema }>;
}

// ---------------------------------------------------------------------------
// Reusable fragments
// ---------------------------------------------------------------------------

const SESSION_SECURITY = [{ sessionCookie: [] }];

/** A `{ error: '<code>' }` body — the shape every failing route returns. */
function errorBody(code: string, extra?: Record<string, unknown>): JsonSchema {
  const properties: Record<string, unknown> = { error: { type: 'string', enum: [code] } };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      properties[key] = value;
    }
  }
  return {
    type: 'object',
    required: ['error'],
    properties,
  };
}

/** A `{ error: '<code>', issues: [...] }` body — the Zod failure shape. */
function issuesBody(code: string): JsonSchema {
  return {
    type: 'object',
    required: ['error', 'issues'],
    properties: {
      error: { type: 'string', enum: [code] },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            path: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' },
          },
        },
      },
    },
  };
}

/** The Zod-issue array shape, reusable via $ref. */
const ZOD_ISSUES_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      path: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
    },
  },
};

const JSON_CONTENT = 'application/json';

/** Shorthand for a JSON request body. */
function jsonBody(
  schema: JsonSchema,
  opts: { required?: boolean; description?: string } = {},
): RequestBody {
  return {
    required: opts.required ?? true,
    description: opts.description,
    content: { [JSON_CONTENT]: { schema } },
  };
}

/** Shorthand for a JSON response. */
function jsonResponse(description: string, schema: JsonSchema): Response {
  return { description, content: { [JSON_CONTENT]: { schema } } };
}

/** Shorthand for a plain `{ ok: true }` response. */
const OK_RESPONSE: Response = jsonResponse('Success', {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean', enum: [true] } },
});

/**
 * The rate-limit response. Note the field name varies by route family:
 * `retryAfterMs` is the norm, but GET /api/tickets/{id} returns
 * `retry_after_ms`. Both are modelled separately where they occur.
 */
function rateLimitedResponse(field: 'retryAfterMs' | 'retry_after_ms' = 'retryAfterMs'): Response {
  return {
    description: 'Rate limited. The `Retry-After` header carries the wait in seconds.',
    content: {
      [JSON_CONTENT]: {
        schema: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', enum: ['rate_limited'] },
            [field]: { type: 'integer', description: 'Milliseconds until the next request is allowed.' },
          },
        },
      },
    },
    headers: {
      'Retry-After': {
        description: 'Whole seconds until the next request is allowed.',
        schema: { type: 'integer' },
      },
    },
  };
}

/** Path parameter helper. */
function pathParam(name: string, description: string): Parameter {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } };
}

/** Query parameter helper. */
function queryParam(
  name: string,
  description: string,
  schema: JsonSchema,
  opts: { required?: boolean } = {},
): Parameter {
  return {
    name,
    in: 'query',
    required: opts.required ?? false,
    description,
    schema,
  };
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ROLE_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['citizen', 'dispatcher', 'crew', 'admin'],
};

const TICKET_STATUS_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['submitted', 'routed', 'in_progress', 'resolved', 'closed', 'cancelled'],
};

/** A photo URL accepted by the API boundary. */
const PHOTO_URL_SCHEMA: JsonSchema = {
  type: 'string',
  maxLength: 7000000,
  description:
    'An inline `data:image/*;base64,…` URL, an absolute http(s) URL, or a root-relative path such as `/api/blob/…`. Script schemes are rejected.',
};

const TRAIL_ENTRY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    toStatus: TICKET_STATUS_SCHEMA,
    actorLabel: {
      type: 'string',
      description:
        'Citizens see the anonymised label "City corporation" / "সিটি কর্পোরেশন"; staff see the raw actor id.',
    },
    actorId: {
      type: ['string', 'null'],
      description: 'Null for citizens — trail actors are anonymised on the citizen serializer.',
    },
    actorRole: {
      type: ['string', 'null'],
      enum: ['citizen', 'dispatcher', 'crew', 'admin', null],
      description:
        'Populated on routes that build an actor-role map (the dispatcher queue, the per-ticket GETs, the crew list). Null on routes that do not.',
    },
    note: { type: ['string', 'null'] },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

/**
 * The ticket shape returned by the citizen, staff and admin surfaces.
 * The citizen branch nulls `assignedCrewId`, `internalNote` and
 * `reporterName`; those fields are present but null on that branch.
 */
const SERIALIZED_TICKET_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    cityName: { type: ['string', 'null'] },
    cityNameBn: { type: ['string', 'null'] },
    wardId: { type: 'string' },
    wardName: { type: ['string', 'null'] },
    wardNameBn: { type: ['string', 'null'] },
    categoryId: { type: 'string' },
    categorySlug: { type: ['string', 'null'] },
    categoryName: { type: ['string', 'null'] },
    categoryNameBn: { type: ['string', 'null'] },
    status: TICKET_STATUS_SCHEMA,
    locationLng: { type: 'number' },
    locationLat: { type: 'number' },
    locationLabel: { type: ['string', 'null'] },
    locationLabelBn: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    beforePhotoUrls: {
      type: 'array',
      items: { type: 'string' },
      description: "The citizen's own photos (the 'before' evidence).",
    },
    afterPhotoUrls: {
      type: 'array',
      items: { type: 'string' },
      description: "The crew's photos (the 'after' evidence).",
    },
    photoUrls: {
      type: 'array',
      items: { type: 'string' },
      description: 'The union of beforePhotoUrls and afterPhotoUrls.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    resolvedAt: { type: ['string', 'null'], format: 'date-time' },
    assignedCrewId: {
      type: ['string', 'null'],
      description: 'Always null on the citizen serializer.',
    },
    internalNote: {
      type: ['string', 'null'],
      description: 'Always null on the citizen serializer.',
    },
    reporterId: { type: 'string' },
    reporterName: {
      type: ['string', 'null'],
      description: 'Always null on the citizen serializer.',
    },
    trail: { type: 'array', items: TRAIL_ENTRY_SCHEMA },
  },
};

/**
 * The narrower ticket shape exposed on the public activity feed — no
 * reporter identity, no internal note, no assigned crew, no trail,
 * and no location label (it can carry a street address).
 */
const PUBLIC_TICKET_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    wardId: { type: 'string' },
    wardName: { type: ['string', 'null'] },
    wardNameBn: { type: ['string', 'null'] },
    categoryId: { type: 'string' },
    categorySlug: { type: ['string', 'null'] },
    categoryName: { type: ['string', 'null'] },
    categoryNameBn: { type: ['string', 'null'] },
    status: TICKET_STATUS_SCHEMA,
    locationLng: { type: 'number' },
    locationLat: { type: 'number' },
    note: { type: ['string', 'null'] },
    beforePhotoUrls: { type: 'array', items: { type: 'string' } },
    afterPhotoUrls: { type: 'array', items: { type: 'string' } },
    photoUrls: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

/** The category shape returned by the admin surfaces. */
const CATEGORY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    departmentId: { type: ['string', 'null'] },
    slug: { type: 'string' },
    name: { type: 'string' },
    nameBn: { type: ['string', 'null'] },
    narrowCategoryPhotoCap: {
      type: ['integer', 'null'],
      description: 'When set, this category accepts fewer photos than the city default.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const DEPARTMENT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    nameBn: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const WARD_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    number: { type: 'integer' },
    name: { type: 'string' },
    nameBn: { type: ['string', 'null'] },
    polygonGeoJson: {
      type: ['string', 'null'],
      description:
        'The ward boundary, stored as a GeoJSON Polygon **string** in v1 (no PostGIS).',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const CITY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    nameBn: { type: ['string', 'null'] },
    defaultLanguage: { type: 'string', enum: ['bn', 'en'] },
    dedupRadiusMeters: { type: 'integer', description: 'Default 50.' },
    status: { type: 'string', enum: ['live', 'setup'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

/** The session shape returned by GET /api/auth/status. */
const SESSION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    sessionId: { type: 'string' },
    userId: { type: 'string' },
    role: ROLE_SCHEMA,
    cityId: { type: 'string' },
    wardId: { type: ['string', 'null'] },
    wardName: { type: ['string', 'null'] },
    wardNameBn: { type: ['string', 'null'] },
    departmentId: { type: ['string', 'null'] },
    departmentName: { type: ['string', 'null'] },
    departmentNameBn: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    nameBn: { type: ['string', 'null'] },
  },
};

const PROFILE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    nameBn: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    role: ROLE_SCHEMA,
    cityId: { type: 'string' },
  },
};

/** A GeoJSON Polygon accepted by the ward endpoints. */
const WARD_POLYGON_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['type', 'coordinates'],
  properties: {
    type: { type: 'string', enum: ['Polygon'] },
    coordinates: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: 'A [longitude, latitude] pair.',
        },
      },
    },
  },
};

/** The user row as stored — returned by the create/update admin routes. */
const ADMIN_USER_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cityId: { type: 'string' },
    role: {
      type: 'string',
      enum: ['citizen', 'dispatcher', 'crew', 'admin'],
      description:
        'The Prisma role. The provisioning API accepts `supervisor` on the way in and stores it as `admin`.',
    },
    name: { type: 'string', description: 'The English name (`nameEn` on the way in).' },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    wardId: { type: ['string', 'null'] },
    departmentId: { type: ['string', 'null'] },
    createdAt: { type: ['string', 'null'], format: 'date-time' },
    updatedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

/** The enriched user card returned by the admin users list. */
const ADMIN_USER_CARD_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    nameBn: { type: 'string' },
    nameEn: { type: 'string' },
    identifier: { type: 'string', description: 'The mobile or email the user signs in with.' },
    email: { type: ['string', 'null'] },
    role: { type: 'string', enum: ['dispatcher', 'crew', 'supervisor'] },
    prismaRole: { type: 'string', enum: ['citizen', 'dispatcher', 'crew', 'admin'] },
    wardIds: { type: 'array', items: { type: 'string' } },
    wardLabels: { type: 'array', items: { type: 'string' } },
    wardLabelsBn: { type: 'array', items: { type: 'string' } },
    crewId: { type: ['string', 'null'] },
    crewLabel: { type: ['string', 'null'] },
    crewLabelBn: { type: ['string', 'null'] },
    departmentId: { type: ['string', 'null'] },
    departmentLabel: { type: ['string', 'null'] },
    departmentLabelBn: { type: ['string', 'null'] },
    status: { type: 'string' },
    lastLoginAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

/** A crew, assembled from its member users. */
const ADMIN_CREW_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    nameBn: { type: 'string' },
    wardId: { type: ['string', 'null'] },
    departmentId: { type: ['string', 'null'] },
    memberIds: { type: 'array', items: { type: 'string' } },
  },
};

/** An audit-log entry, as shown on the admin audit dashboard. */
const AUDIT_ENTRY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    actorId: { type: 'string' },
    actorName: { type: 'string' },
    actorRole: { type: 'string', enum: ['citizen', 'dispatcher', 'crew', 'admin'] },
    action: { type: 'string' },
    entityType: { type: 'string', enum: ['ticket', 'city', 'category', 'department', 'ward', 'user'] },
    entityId: { type: 'string' },
    beforeValue: { type: ['object', 'null'] },
    afterValue: { type: ['object', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

/** The 4.7 post-launch adoption dashboard payload. */
const ADOPTION_DASHBOARD_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'cityId',
    'from',
    'to',
    'hero',
    'funnel',
    'daily',
    'wards',
    'engagement',
    'healthFlags',
    'comparison',
  ],
  properties: {
    cityId: { type: 'string' },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    hero: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['registeredCitizens', 'reportsReceived', 'resolutionRate', 'avgTimeToResolve'],
          },
          value: { type: 'number' },
          unit: { type: 'string', enum: ['count', 'percent', 'duration'] },
          deltaPercent: {
            type: ['number', 'null'],
            description: 'Percentage change vs the immediately-preceding window of the same length.',
          },
          durationMs: { type: ['number', 'null'], description: 'Raw milliseconds — only on the duration stat.' },
        },
      },
    },
    funnel: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: ['visit', 'registered', 'submitted', 'secondReport', 'feedback'] },
          count: { type: 'integer' },
          conversion: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 1,
            description: 'Conversion from the previous stage. Null on the first stage.',
          },
        },
      },
    },
    daily: {
      type: 'array',
      description: 'Capped at 180 days.',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '`YYYY-MM-DD`.' },
          submitted: { type: 'integer' },
          resolved: { type: 'integer' },
          registered: { type: 'integer' },
        },
      },
    },
    wards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          wardId: { type: 'string' },
          wardNumber: { type: 'integer' },
          wardName: { type: 'string' },
          wardNameBn: { type: ['string', 'null'] },
          reports: { type: 'integer' },
          resolved: { type: 'integer' },
          intensity: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    engagement: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: ['staffActivity', 'citizenRetention', 'crewResponseTime'] },
          value: { type: 'number', description: '0..100 for the percentage signals; milliseconds for the duration signal.' },
          unit: { type: 'string', enum: ['percent', 'duration'] },
          detail: {
            type: 'object',
            properties: {
              active: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    healthFlags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          kind: { type: 'string', enum: ['staff', 'backlog', 'coverage'] },
          vars: { type: 'object', additionalProperties: true },
          href: { type: 'string' },
        },
      },
    },
    comparison: {
      oneOf: [
        {
          type: 'object',
          properties: {
            cityId: { type: 'string' },
            cityName: { type: 'string' },
            reportsReceived: { type: 'integer' },
            resolutionRate: { type: 'integer' },
            registeredCitizens: { type: 'integer' },
            daily: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  submitted: { type: 'integer' },
                  resolved: { type: 'integer' },
                  registered: { type: 'integer' },
                },
              },
            },
          },
        },
        { type: 'null' },
      ],
      description: 'The Dhaka overlay. Null unless `compare=1` and the Dhaka city exists.',
    },
  },
};

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export const openapiSpec: OpenApiObject = {
  openapi: '3.0.3',
  info: {
    title: 'CityFix API',
    version: '0.1.0',
    description: [
      'CityFix — citizen-powered city issue reporting & tracking.',
      '',
      '## Authentication',
      '',
      'Authentication is a signed, HTTP-only session cookie named `cityfix_session`.',
      'Sign in through one of the auth endpoints below; the response sets the cookie',
      'and every subsequent request must carry it.',
      '',
      'The cookie value is `<sessionId>.<hmac-sha256-hex>` — opaque to clients,',
      'tamper-evident server-side. Attributes: `HttpOnly`, `SameSite=Lax`,',
      '`Path=/`, `Secure` in production. The session expires 14 days after it is',
      'issued (the expiry is fixed, not sliding).',
      '',
      '### Roles',
      '',
      'Four roles: `citizen`, `dispatcher`, `crew`, `admin`.',
      '',
      '- **citizen** — files and tracks their own reports.',
      '- **dispatcher** — triages the ward queue, assigns crews, transitions tickets.',
      '- **crew** — works the tickets assigned to them and uploads after-photos.',
      '- **admin** — city-wide configuration. Admin **writes** additionally require a',
      '  fresh WebAuthn assertion (ADR-007): a password login lets an admin *read*',
      '  the admin surfaces but not change them.',
      '',
      '## Scope enforcement',
      '',
      'Dispatcher and crew sessions are bound to a `(city, ward, department)` scope.',
      'A request for a ticket outside that scope is refused.',
      '',
      'A ticket\'s department comes from its **category**, not from the ticket row.',
      'A category with no department produces a ticket that is *not*',
      'department-scoped, and a session with no department binding is likewise not',
      'department-scoped. The department check therefore refuses a request only',
      'when **both** sides are department-scoped and they differ; otherwise the',
      'ticket is visible to every dispatcher or crew member in its ward. The ward',
      'check is unconditional and always fires first.',
      '',
      '## Rate limiting',
      '',
      'A per-key token bucket allows roughly one request per second, with a burst',
      'capacity of 1 in production and 4 in development. Exceeding it returns 429',
      'with a `Retry-After` header.',
      '',
      '## Known inconsistencies',
      '',
      'This API is not internally uniform, and the spec documents the current',
      'behaviour rather than a normalised ideal:',
      '',
      '- The unauthenticated error code is `not_authenticated` on most routes, but',
      '  `unauthenticated` under `/api/v1/admin/**` and on `/api/profile`.',
      '- Query-parameter validation failures return `invalid_query` on the',
      '  dispatcher and crew list routes, but `invalid_input` elsewhere.',
      '- The rate-limit retry field is `retryAfterMs` on most routes, but',
      '  `retry_after_ms` on `GET /api/tickets/{id}`.',
      '- An illegal transition returns 409 `invalid_transition` on',
      '  `POST /api/tickets/{id}/transition`, but 422 `illegal_transition` on the',
      '  v1 dispatcher and crew transition routes.',
      '',
      '## Excluded',
      '',
      'The `/api/dev/**` routes are development-only tooling and are deliberately',
      'not documented here.',
    ].join('\n'),
    license: { name: 'UNLICENSED' },
  },
  servers: [{ url: '/', description: 'This deployment' }],
  tags: [
    { name: 'Auth', description: 'Registration, password login, OTP, and WebAuthn ceremonies.' },
    { name: 'Tickets', description: 'Citizen-facing report lifecycle: create, read, edit, delete, feedback.' },
    { name: 'Dispatcher', description: 'The dispatcher triage surface: queue, map, monitor, performance, dedup review.' },
    { name: 'Crew', description: 'The crew work surface: assigned tickets, transitions, after-photos.' },
    { name: 'Admin', description: 'City-wide configuration and oversight. Writes require a WebAuthn assertion.' },
    { name: 'Activity', description: 'City activity feeds — one personal, one public.' },
    { name: 'Misc', description: 'Push subscriptions, report bootstrap, and profile.' },
  ],
  security: [],
  paths: {},
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'cityfix_session',
        description:
          'Signed session cookie issued by the auth endpoints. Send it with every authenticated request.',
      },
    },
    schemas: {
      Error: errorBody('<code>'),
      ZodIssues: ZOD_ISSUES_SCHEMA,
      SerializedTicket: SERIALIZED_TICKET_SCHEMA,
      PublicSerializedTicket: PUBLIC_TICKET_SCHEMA,
      TrailEntry: TRAIL_ENTRY_SCHEMA,
      City: CITY_SCHEMA,
      Category: CATEGORY_SCHEMA,
      Department: DEPARTMENT_SCHEMA,
      Ward: WARD_SCHEMA,
      Session: SESSION_SCHEMA,
      Profile: PROFILE_SCHEMA,
      Role: ROLE_SCHEMA,
      TicketStatus: TICKET_STATUS_SCHEMA,
      PhotoUrl: PHOTO_URL_SCHEMA,
      WardPolygon: WARD_POLYGON_SCHEMA,
      AdminUser: ADMIN_USER_SCHEMA,
      AdminUserCard: ADMIN_USER_CARD_SCHEMA,
      AdminCrew: ADMIN_CREW_SCHEMA,
      AuditEntry: AUDIT_ENTRY_SCHEMA,
      AdoptionDashboard: ADOPTION_DASHBOARD_SCHEMA,
    },
    responses: {
      InvalidJson: jsonResponse('The request body was not valid JSON.', errorBody('invalid_json')),
      InvalidInput: jsonResponse('The request body failed validation.', issuesBody('invalid_input')),
      InvalidQuery: jsonResponse('The query parameters failed validation.', issuesBody('invalid_query')),
      NotFound: jsonResponse('The resource does not exist.', errorBody('not_found')),
      RateLimited: rateLimitedResponse(),
      Unauthorized: jsonResponse('No session, or the session is not valid.', errorBody('not_authenticated')),
      UnauthenticatedAdmin: jsonResponse(
        'No admin session. Admin routes report a missing session as `unauthenticated` rather than `not_authenticated`.',
        errorBody('unauthenticated'),
      ),
      Forbidden: jsonResponse('The session does not have the required role or scope.', errorBody('forbidden_role')),
      WebAuthnRequired: jsonResponse(
        'Admin writes require a WebAuthn assertion. The session has no registered credential, or the most recent challenge has expired.',
        errorBody('webauthn_required'),
      ),
    },
    parameters: {
      TicketId: pathParam('id', 'The ticket identifier.'),
      CityId: pathParam('id', 'The city identifier.'),
      CategoryId: pathParam('catId', 'The category identifier.'),
      DepartmentId: pathParam('deptId', 'The department identifier.'),
      WardId: pathParam('wardId', 'The ward identifier.'),
      UserId: pathParam('userId', 'The user identifier.'),
      Limit: queryParam('limit', 'Maximum number of rows to return.', { type: 'integer' }),
      Cursor: queryParam('cursor', 'Opaque pagination cursor — the `createdAt` of the last row on the previous page.', { type: 'string' }),
    },
  },
};

/** The paths, keyed by URL path. Assigned below to keep the components readable. */
export const openapiPaths: Record<string, PathItem> = {
  // -- Auth ---------------------------------------------------------------
  '/api/v1/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a citizen account',
      description:
        'Creates a citizen in the given city and mints a session, setting the `cityfix_session` cookie. Phone uniqueness is enforced per city.',
      operationId: 'registerCitizen',
      security: [],
      requestBody: jsonBody(
        {
          type: 'object',
          required: ['phone', 'nid', 'name', 'password'],
          properties: {
            phone: { type: 'string', minLength: 11, maxLength: 14, pattern: '^[0-9+\\-]+$', description: 'A local (`01…`), country (`8801…`) or international (`+8801…`) number.' },
            nid: { type: 'string', pattern: '^([0-9]{10}|[0-9]{17})$', description: 'National ID — 10 or 17 digits.' },
            name: { type: 'string', minLength: 2, maxLength: 120 },
            password: { type: 'string', minLength: 8, maxLength: 200, description: 'At least 8 characters with at least one digit.' },
            citySlug: { type: 'string', minLength: 1, default: 'dhaka-north' },
          },
        },
        { description: 'The new citizen’s details.' },
      ),
      responses: {
        '201': jsonResponse('The citizen was created and a session cookie was set.', {
          type: 'object',
          required: ['ok', 'userId'],
          properties: { ok: { type: 'boolean', enum: [true] }, userId: { type: 'string' } },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '404': jsonResponse('The city slug does not resolve.', errorBody('city_not_found')),
        '409': jsonResponse('The phone number is already registered in this city.', errorBody('phone_already_registered')),
        '429': rateLimitedResponse(),
        '500': jsonResponse('The registration could not be completed.', errorBody('server_error')),
      },
    },
  },
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Sign in with a phone number and password',
      description:
        'Authenticates a user of any role and sets the `cityfix_session` cookie. Errors are deliberately vague — a wrong phone and a wrong password are indistinguishable.',
      operationId: 'login',
      security: [],
      requestBody: jsonBody({
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', minLength: 11, maxLength: 20 },
          password: { type: 'string', minLength: 1, maxLength: 200 },
          citySlug: { type: 'string', minLength: 1, default: 'dhaka-north' },
        },
      }),
      responses: {
        '200': jsonResponse('Signed in. The session cookie was set.', {
          type: 'object',
          required: ['ok', 'userId', 'role'],
          properties: {
            ok: { type: 'boolean', enum: [true] },
            userId: { type: 'string' },
            role: ROLE_SCHEMA,
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('The phone or password is wrong.', errorBody('wrong_credentials')),
        '404': jsonResponse('The city slug does not resolve.', errorBody('city_not_found')),
        '423': jsonResponse('Too many failed attempts — the account is locked.', errorBody('locked', { retryAfterMs: { type: 'integer' } })),
        '429': rateLimitedResponse(),
      },
    },
  },
  '/api/v1/auth/send-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Send a one-time password',
      description:
        'Issues an OTP for a phone number. The code is delivered by SMS; in development it is also returned in `dev_code`.',
      operationId: 'sendOtp',
      security: [],
      requestBody: jsonBody({
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', minLength: 11, maxLength: 20 },
          citySlug: { type: 'string', minLength: 1, default: 'dhaka-north' },
          scope: { type: 'string', enum: ['registration', 'login', 'password-reset'], default: 'registration' },
        },
      }),
      responses: {
        '200': jsonResponse('The OTP was issued.', {
          type: 'object',
          required: ['ok', 'ttlMs', 'dev_code'],
          properties: {
            ok: { type: 'boolean', enum: [true] },
            ttlMs: { type: 'integer', description: 'The code’s lifetime in milliseconds.' },
            dev_code: { type: 'string', description: 'The plaintext code. Present in every environment while the SMS provider is stubbed.' },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '404': jsonResponse('The city does not exist, or there is no pending user for this phone.', {
          oneOf: [errorBody('city_not_found'), errorBody('no_pending_user')],
        }),
        '429': jsonResponse('Rate limited, or the resend cooldown has not elapsed.', {
          oneOf: [rateLimitedResponse(), errorBody('resend_cooldown', { retryAfterMs: { type: 'integer' } })],
        }),
        '502': jsonResponse('The SMS provider rejected the send.', errorBody('sms_provider_failure', { detail: { type: 'string' } })),
      },
    },
  },
  '/api/v1/auth/verify-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Redeem a one-time password',
      description: 'Verifies the OTP and mints or refreshes a citizen session.',
      operationId: 'verifyOtp',
      security: [],
      requestBody: jsonBody({
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', minLength: 11, maxLength: 20 },
          code: { type: 'string', pattern: '^[0-9]{6}$' },
          citySlug: { type: 'string', minLength: 1, default: 'dhaka-north' },
          scope: { type: 'string', enum: ['registration', 'login', 'password-reset'], default: 'registration' },
        },
      }),
      responses: {
        '200': jsonResponse('The code was accepted. The session cookie was set.', {
          type: 'object',
          required: ['ok', 'userId', 'role'],
          properties: {
            ok: { type: 'boolean', enum: [true] },
            userId: { type: 'string' },
            role: { type: 'string', enum: ['citizen'] },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse(
          'The code is wrong. `attempts` is how many wrong guesses have been made against this code and `remaining` is how many are left before it is locked out.',
          errorBody('wrong_code', {
            attempts: { type: 'integer', description: 'Wrong guesses made against this code so far.' },
            remaining: { type: 'integer', description: 'Guesses left before the code is locked out.' },
          }),
        ),
        '404': jsonResponse('The city does not exist, or there is no pending verification for this phone.', {
          oneOf: [errorBody('city_not_found'), errorBody('no_pending_verification')],
        }),
        '410': jsonResponse('The code has expired.', errorBody('expired')),
        '429': {
          description:
            'Either the IP rate limit was hit, or the code was locked out after too many wrong guesses. The `Retry-After` header carries the wait in seconds.',
          content: {
            [JSON_CONTENT]: {
              schema: {
                oneOf: [
                  errorBody('rate_limited', { retryAfterMs: { type: 'integer' } }),
                  errorBody('too_many_attempts', {
                    attempts: { type: 'integer' },
                    maxAttempts: { type: 'integer' },
                  }),
                ],
              },
            },
          },
          headers: {
            'Retry-After': {
              description: 'Whole seconds until the next request is allowed.',
              schema: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  '/api/auth/status': {
    get: {
      tags: ['Auth'],
      summary: 'Read the current session',
      description: 'Returns the active session and its resolved scope. Never returns 401 — an absent session is reported as `authenticated: false`.',
      operationId: 'getAuthStatus',
      security: [],
      responses: {
        '200': jsonResponse('The session state.', {
          type: 'object',
          required: ['authenticated', 'session'],
          properties: {
            authenticated: { type: 'boolean' },
            session: {
              oneOf: [{ $ref: '#/components/schemas/Session' }, { type: 'null' }],
            },
          },
        }),
      },
    },
  },
  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'End the session',
      description: 'Deletes the session server-side and clears the cookie. Idempotent — signing out without a session still returns 200.',
      operationId: 'logout',
      security: [],
      responses: { '200': OK_RESPONSE },
    },
  },
  '/api/auth/webauthn/login': {
    post: {
      tags: ['Auth'],
      summary: 'Begin an admin WebAuthn assertion',
      description:
        'Anonymous by design — this is the admin’s pre-session entry point. Returns the assertion ceremony options to feed to `navigator.credentials.get(...)`. The challenge is valid for 5 minutes; the ceremony timeout is 60 seconds.',
      operationId: 'webauthnAssertionChallenge',
      security: [],
      requestBody: jsonBody({
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      }),
      responses: {
        '200': jsonResponse('The assertion challenge.', {
          type: 'object',
          required: ['challengeId', 'challenge', 'rpId', 'allowCredentials', 'userVerification', 'timeout'],
          properties: {
            challengeId: { type: 'string' },
            challenge: { type: 'string', description: 'Base64url nonce.' },
            rpId: { type: 'string' },
            allowCredentials: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  transports: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            userVerification: { type: 'string', enum: ['preferred', 'required', 'discouraged'] },
            timeout: { type: 'integer' },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '404': jsonResponse('No admin account uses this email.', errorBody('admin_not_found')),
        '409': jsonResponse('The admin has no registered WebAuthn credential.', errorBody('webauthn_no_credential')),
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },
  '/api/auth/webauthn/assertion': {
    post: {
      tags: ['Auth'],
      summary: 'Complete an admin WebAuthn assertion',
      description:
        'Verifies the signed assertion and mints an admin session, setting the `cityfix_session` cookie.',
      operationId: 'webauthnAssertion',
      security: [],
      requestBody: jsonBody({
        type: 'object',
        required: ['challengeId', 'assertionResponse'],
        properties: {
          challengeId: { type: 'string', minLength: 1 },
          assertionResponse: {
            type: 'object',
            description: 'The `navigator.credentials.get(...)` result — `id`, `rawId`, `response`, `type`, `clientExtensionResults`.',
            additionalProperties: true,
          },
        },
      }),
      responses: {
        '200': jsonResponse('The assertion was verified. The session cookie was set.', {
          type: 'object',
          required: ['authenticated', 'session'],
          properties: {
            authenticated: { type: 'boolean', enum: [true] },
            session: {
              type: 'object',
              required: ['sessionId', 'userId', 'role', 'cityId'],
              properties: {
                sessionId: { type: 'string' },
                userId: { type: 'string' },
                role: { type: 'string', enum: ['admin'] },
                cityId: { type: 'string' },
              },
            },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('The assertion failed, or the challenge expired.', {
          oneOf: [errorBody('webauthn_assertion_failed'), errorBody('webauthn_assertion_expired')],
        }),
        '404': jsonResponse('The challenge or the credential does not exist.', {
          oneOf: [errorBody('webauthn_challenge_not_found'), errorBody('webauthn_credential_not_found')],
        }),
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },
  '/api/auth/webauthn/step-up': {
    post: {
      tags: ['Auth'],
      summary: 'Complete a session-authenticated WebAuthn step-up',
      description:
        'The step-up ceremony for an admin who is ALREADY signed in. Unlike `/api/auth/webauthn/assertion` (which mints a session and is the login flow), this route mints nothing: it verifies possession of the authenticator and refreshes the challenge ledger row that the `requireWebAuthn` guard reads, so the admin’s next gated write succeeds. The challenge is always bound to the session’s own user — a challenge issued for another user is rejected with 403.',
      operationId: 'webauthnStepUp',
      requestBody: jsonBody({
        oneOf: [
          {
            type: 'object',
            required: ['action'],
            properties: { action: { type: 'string', enum: ['challenge'] } },
          },
          {
            type: 'object',
            required: ['action', 'challengeId', 'assertionResponse'],
            properties: {
              action: { type: 'string', enum: ['verify'] },
              challengeId: { type: 'string', minLength: 1 },
              assertionResponse: {
                type: 'object',
                description: 'The `navigator.credentials.get(...)` result — `id`, `rawId`, `response`, `type`, `clientExtensionResults`.',
                additionalProperties: true,
              },
            },
          },
        ],
      }),
      responses: {
        '200': jsonResponse(
          'For `action: "challenge"`, the assertion ceremony options. For `action: "verify"`, the step-up completed.',
          {
            oneOf: [
              {
                type: 'object',
                required: ['challengeId', 'challenge', 'rpId', 'allowCredentials', 'userVerification', 'timeout'],
                properties: {
                  challengeId: { type: 'string' },
                  challenge: { type: 'string', description: 'Base64url nonce.' },
                  rpId: { type: 'string' },
                  allowCredentials: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        transports: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                  userVerification: { type: 'string', enum: ['preferred', 'required', 'discouraged'] },
                  timeout: { type: 'integer' },
                },
              },
              {
                type: 'object',
                required: ['ok'],
                properties: { ok: { type: 'boolean', enum: [true] } },
              },
            ],
          },
        ),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('Not signed in, or the assertion failed.', {
          oneOf: [
            errorBody('not_authenticated'),
            errorBody('webauthn_assertion_failed'),
            errorBody('webauthn_assertion_expired'),
          ],
        }),
        '403': jsonResponse('The session is not an admin, or the challenge belongs to another user.', {
          oneOf: [errorBody('forbidden_role'), errorBody('webauthn_challenge_owner_mismatch')],
        }),
        '404': jsonResponse('The challenge or the credential does not exist.', {
          oneOf: [errorBody('webauthn_challenge_not_found'), errorBody('webauthn_credential_not_found')],
        }),
        '409': jsonResponse('The admin has no registered WebAuthn credential.', errorBody('webauthn_no_credential')),
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },
  '/api/auth/webauthn/register/challenge': {
    post: {
      tags: ['Auth'],
      summary: 'Begin a WebAuthn registration ceremony',
      description:
        'Issues a registration challenge for the signed-in admin. The credential is always bound to the session’s own user — never to a user id supplied in the body.',
      operationId: 'webauthnRegisterChallenge',
      requestBody: jsonBody(
        {
          type: 'object',
          properties: {
            credentialName: { type: 'string', maxLength: 120, description: 'A label for the credential. Carries no authority.' },
          },
        },
        { required: false },
      ),
      responses: {
        '200': jsonResponse('The registration challenge and options.', {
          type: 'object',
          required: ['challengeId', 'options'],
          properties: {
            challengeId: { type: 'string' },
            options: {
              type: 'object',
              description: 'The `@simplewebauthn/browser` `startRegistration(...)` argument.',
              additionalProperties: true,
            },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },
  '/api/auth/webauthn/register': {
    post: {
      tags: ['Auth'],
      summary: 'Complete a WebAuthn registration ceremony',
      description: 'Stores a new credential against the signed-in admin.',
      operationId: 'webauthnRegister',
      requestBody: jsonBody({
        type: 'object',
        required: ['credentialName', 'attestationResponse'],
        properties: {
          credentialName: { type: 'string', minLength: 1, maxLength: 120 },
          attestationResponse: {
            type: 'object',
            description: 'The `navigator.credentials.create(...)` result — `id`, `rawId`, `response`, `type`, `clientExtensionResults`.',
            additionalProperties: true,
          },
        },
      }),
      responses: {
        '201': jsonResponse('The credential was stored.', {
          type: 'object',
          required: ['credential'],
          properties: {
            credential: {
              type: 'object',
              required: ['id', 'name', 'registeredAt'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                registeredAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('The attestation failed, or there is no admin session.', {
          oneOf: [{ $ref: '#/components/responses/Unauthorized' }, errorBody('webauthn_attestation_failed')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The admin account does not exist.', errorBody('admin_not_found')),
        '409': jsonResponse('This credential is already registered.', errorBody('webauthn_duplicate_credential')),
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },
  '/api/auth/webauthn/revoke': {
    delete: {
      tags: ['Auth'],
      summary: 'Revoke a WebAuthn credential',
      description: 'Removes a registered credential. The last remaining credential cannot be revoked.',
      operationId: 'webauthnRevoke',
      requestBody: jsonBody({
        type: 'object',
        required: ['credentialId'],
        properties: { credentialId: { type: 'string', minLength: 1 } },
      }),
      responses: {
        '204': { description: 'The credential was revoked. No body.' },
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The credential does not exist.', errorBody('webauthn_credential_not_found')),
        '409': jsonResponse('This is the last credential — it cannot be revoked.', errorBody('webauthn_last_credential')),
        '500': jsonResponse('Unexpected server error.', errorBody('unhandled')),
      },
    },
  },

  // -- Tickets ------------------------------------------------------------
  '/api/tickets': {
    get: {
      tags: ['Tickets'],
      summary: 'List the signed-in citizen’s reports',
      description:
        'Returns every report the citizen filed in their city, newest first. There is no pagination — the route accepts no query parameters.',
      operationId: 'listMyTickets',
      responses: {
        '200': jsonResponse('The citizen’s reports.', {
          type: 'object',
          required: ['tickets'],
          properties: { tickets: { type: 'array', items: { $ref: '#/components/schemas/SerializedTicket' } } },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Only citizens have a personal report list.', errorBody('role_not_supported')),
      },
    },
    post: {
      tags: ['Tickets'],
      summary: 'File a report',
      description: [
        'Creates a report in the citizen’s city and files it under the given ward and category.',
        '',
        'A near-duplicate is **not** merged. When another open report sits within the',
        'city’s dedup radius this returns 200 with a `dedup_match` prompt and creates',
        'nothing; the citizen can then re-POST with `dedupDeclineTicketId` to file it',
        'anyway, which raises a review flag for the dispatcher.',
        '',
        'Two reports filed at the *identical* location at the same instant are also',
        'de-duplicated, by the database rather than by the scan: a unique index on the',
        'location key refuses the second insert and the loser is returned the same',
        '`dedup_match` prompt. A report filed after a `dedupDeclineTicketId` is exempt',
        'from that index — an acknowledged duplicate must always be creatable.',
      ].join('\n'),
      operationId: 'createTicket',
      requestBody: jsonBody({
        type: 'object',
        required: ['cityId', 'wardId', 'categoryId', 'locationLat', 'locationLng'],
        properties: {
          cityId: { type: 'string', minLength: 1 },
          wardId: { type: 'string', minLength: 1 },
          categoryId: { type: 'string', minLength: 1 },
          locationLat: { type: 'number', minimum: -90, maximum: 90 },
          locationLng: { type: 'number', minimum: -180, maximum: 180 },
          locationLabel: { type: 'string', maxLength: 500 },
          locationLabelBn: { type: 'string', maxLength: 500 },
          note: { type: 'string', maxLength: 2000 },
          photoUrls: {
            type: 'array',
            maxItems: 5,
            default: [],
            items: { $ref: '#/components/schemas/PhotoUrl' },
          },
          photoBlobs: {
            type: 'array',
            maxItems: 5,
            default: [],
            description: 'Raw photo bytes, base64-encoded, for upload to the blob store.',
            items: {
              type: 'object',
              required: ['dataBase64', 'mimeType'],
              properties: {
                dataBase64: { type: 'string', minLength: 1, maxLength: 7000000 },
                mimeType: { type: 'string', minLength: 1, maxLength: 100 },
                fileName: { type: 'string', maxLength: 255 },
              },
            },
          },
          dedupDeclineTicketId: {
            type: 'string',
            minLength: 1,
            description: 'The ticket id of the dedup match the citizen chose to file alongside.',
          },
        },
      }),
      responses: {
        '201': jsonResponse('The report was created.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '200': jsonResponse('A possible duplicate was found — nothing was created. The citizen can decline the match and re-POST.', {
          type: 'object',
          required: ['dedup_match', 'existing_ticket_id', 'distance_meters', 'existing_status'],
          properties: {
            dedup_match: { type: 'boolean', enum: [true] },
            existing_ticket_id: { type: 'string' },
            distance_meters: { type: 'number' },
            existing_status: { type: 'string' },
          },
        }),
        '400': jsonResponse('Validation failed, or the ward/category belongs to another city.', {
          oneOf: [
            issuesBody('invalid_input'),
            errorBody('ward_not_in_city'),
            errorBody('category_not_in_city'),
          ],
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('The report was filed against a different city than the session.', errorBody('cross_city_forbidden')),
        '409': jsonResponse(
          'A concurrent submission of the same location won the dedup race, and the winning ticket could not be resolved afterwards. The citizen should retry.',
          errorBody('dedup_conflict_unresolved'),
        ),
        '413': jsonResponse('A photo exceeded the size limit.', errorBody('photo_too_large', { max_chars: { type: 'integer' } })),
        '500': jsonResponse('The report was created but could not be read back.', errorBody('post_create_fetch_failed')),
      },
    },
  },
  '/api/tickets/{id}': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    get: {
      tags: ['Tickets'],
      summary: 'Read a single report',
      description:
        'Citizens may read their own reports; dispatcher and crew sessions may read reports inside their scope. The response includes a `last_poll_cursor` for incremental polling, and — for citizens only — the rating they have already left.',
      operationId: 'getTicket',
      responses: {
        '200': jsonResponse('The report.', {
          type: 'object',
          required: ['ticket', 'last_poll_cursor'],
          properties: {
            ticket: { $ref: '#/components/schemas/SerializedTicket' },
            last_poll_cursor: { type: 'string', format: 'date-time', description: 'The ticket’s `updatedAt` — pass it back to detect changes.' },
            feedback_rating: {
              type: ['string', 'null'],
              enum: ['positive', 'negative', 'neutral', null],
              description: 'Present only on the citizen branch. Null when the citizen has not rated the resolution.',
            },
          },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('The ticket belongs to another citizen, or is outside the session’s scope. A ticket whose category has no department is not department-scoped, so it is visible to every dispatcher or crew member in its ward; `cross_department_access_denied` is returned only when both the ticket and the session are department-scoped and the two departments differ.', {
          oneOf: [errorBody('not_owner'), errorBody('cross_ward_access_denied'), errorBody('cross_department_access_denied'), errorBody('cross_city_access_denied')],
        }),
        '404': { $ref: '#/components/responses/NotFound' },
        '429': rateLimitedResponse('retry_after_ms'),
      },
    },
    // NO `patch` AND NO `delete` HERE — ON PURPOSE.
    //
    // Both operations used to be documented on this path. Neither has
    // ever existed: `app/api/tickets/[id]/route.ts` exports only `GET`
    // (line 17), and both requests return 405. The 2026-11-08
    // production-readiness audit found the phantom pair by reconciling
    // the 61 route files against this document; the Swagger UI at
    // /api/docs was telling developers that a citizen could edit or
    // delete their own report.
    //
    // The blocks were deleted rather than left as "planned", because a
    // spec that lists unimplemented operations is indistinguishable
    // from a spec that lists broken ones. If a future Bolt implements
    // citizen report editing, it must add the handler AND the spec
    // block in the same commit — `tests/unit/docs/openapi-route-parity.test.ts`
    // now compares this document against the route files
    // mechanically, so the two can no longer drift apart.
  },
  '/api/tickets/{id}/transition': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Tickets'],
      summary: 'Advance a report’s status',
      description: [
        'The legacy staff transition route. Preferred over the v1 dispatcher and crew',
        'transition routes, which enforce a narrower per-role status allow-list.',
        '',
        'Allowed transitions: `submitted → routed | cancelled`, `routed → in_progress |',
        'cancelled`, `in_progress → resolved | cancelled`. `resolved`, `closed` and',
        '`cancelled` are terminal.',
      ].join('\n'),
      operationId: 'transitionTicket',
      requestBody: jsonBody(
        {
          type: 'object',
          properties: {
            toStatus: { type: 'string', enum: ['routed', 'in_progress', 'resolved', 'cancelled'] },
            note: { type: 'string', maxLength: 1000 },
            assignedCrewId: { type: 'string' },
          },
        },
        {
          required: false,
          description: 'Supply either `toStatus` or `assignedCrewId`; supplying neither returns 400.',
        },
      ),
      responses: {
        '200': jsonResponse('The transitioned report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('Validation failed, or neither `toStatus` nor `assignedCrewId` was supplied.', {
          oneOf: [issuesBody('invalid_input'), errorBody('invalid_input', { detail: { type: 'string' } })],
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('This role may not perform that transition.', errorBody('role_cannot_perform_transition')),
        '404': { $ref: '#/components/responses/NotFound' },
        '409': jsonResponse('The transition is not legal from the ticket’s current status.', errorBody('invalid_transition', { from_status: { type: 'string' }, to_status: { type: 'string' } })),
        '500': jsonResponse('The transition could not be applied.', errorBody('transition_failed', { detail: { type: 'string' } })),
      },
    },
  },
  '/api/tickets/{id}/feedback': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Tickets'],
      summary: 'Rate the resolution of a report',
      description:
        'The citizen rates a resolved report. Re-submitting the same rating is accepted and reports `changed: false`.',
      operationId: 'submitTicketFeedback',
      requestBody: jsonBody({
        type: 'object',
        required: ['rating'],
        properties: {
          rating: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          comment: { type: 'string', maxLength: 2000 },
        },
      }),
      responses: {
        '201': jsonResponse('The rating was recorded.', {
          type: 'object',
          required: ['ticket_id', 'rating', 'changed'],
          properties: {
            ticket_id: { type: 'string' },
            rating: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
            changed: { type: 'boolean', enum: [true] },
          },
        }),
        '200': jsonResponse('The rating was recorded but had not changed.', {
          type: 'object',
          required: ['ticket_id', 'rating', 'changed'],
          properties: {
            ticket_id: { type: 'string' },
            rating: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
            changed: { type: 'boolean', enum: [false] },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('The report belongs to another citizen.', errorBody('not_owner')),
        '404': { $ref: '#/components/responses/NotFound' },
        '409': jsonResponse('Only a resolved report can be rated.', errorBody('ticket_not_resolved')),
        '500': jsonResponse('The rating could not be stored.', errorBody('feedback_write_failed')),
      },
    },
  },
  '/api/tickets/{id}/photos/{idx}': {
    parameters: [
      { $ref: '#/components/parameters/TicketId' },
      { name: 'idx', in: 'path', required: true, description: 'The zero-based index of the photo to remove.', schema: { type: 'string', pattern: '^\\d+$' } },
    ],
    delete: {
      tags: ['Tickets'],
      summary: 'Remove a photo from a report',
      description: 'Removes a citizen-uploaded photo by its index in the ticket’s photo list.',
      operationId: 'deleteTicketPhoto',
      responses: {
        '200': jsonResponse('The report with the photo removed.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('The path parameters were invalid.', errorBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('The report belongs to another citizen.', errorBody('not_owner')),
        '404': jsonResponse('The report does not exist, or the index is out of range.', {
          oneOf: [errorBody('not_found'), errorBody('photo_index_out_of_range')],
        }),
        '409': jsonResponse('Photos can no longer be removed once the report is resolved.', errorBody('photo_locked_after_resolution')),
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  },

  // -- Dispatcher ----------------------------------------------------------
  '/api/v1/dispatcher/queue': {
    get: {
      tags: ['Dispatcher'],
      summary: 'The dispatcher triage queue',
      description:
        'Returns the reports in the dispatcher’s scope, oldest first, and the number of pending dedup flags awaiting review. Reports carrying a pending dedup flag are excluded from the list until the flag is resolved.',
      operationId: 'dispatcherQueue',
      parameters: [
        queryParam('status', 'Filter by status. Omit to include both `submitted` and `routed`.', { type: 'string', enum: ['submitted', 'routed'] }),
        queryParam('limit', 'Maximum rows to return.', { type: 'integer', minimum: 1, maximum: 100, default: 50 }),
        queryParam('cityId', 'Must match the session’s city, or the request is refused.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The triage queue.', {
          type: 'object',
          required: ['tickets', 'pendingDedupCount'],
          properties: {
            tickets: { type: 'array', items: { $ref: '#/components/schemas/SerializedTicket' } },
            pendingDedupCount: { type: 'integer', description: 'Pending dedup flags in the dispatcher’s ward.' },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
      },
    },
  },
  '/api/v1/dispatcher/map/tickets': {
    get: {
      tags: ['Dispatcher'],
      summary: 'Map pins for the dispatcher',
      description: 'Returns lightweight pins for the map view — no notes, photos or trail.',
      operationId: 'dispatcherMapTickets',
      parameters: [
        queryParam('status', 'Comma-separated statuses. Defaults to `submitted,routed,in_progress`.', { type: 'string' }),
        queryParam('bbox', 'Bounding box as `swLat,swLng,neLat,neLng`.', { type: 'string' }),
        queryParam('limit', 'Maximum pins to return.', { type: 'integer', minimum: 1, maximum: 200, default: 200 }),
        queryParam('cityId', 'Must match the session’s city, or the request is refused.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The map pins.', {
          type: 'object',
          required: ['pins'],
          properties: {
            pins: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  status: { type: 'string' },
                  categoryId: { type: 'string' },
                  categorySlug: { type: ['string', 'null'] },
                  categoryName: { type: ['string', 'null'] },
                  categoryNameBn: { type: ['string', 'null'] },
                  wardId: { type: 'string' },
                  wardName: { type: ['string', 'null'] },
                  wardNameBn: { type: ['string', 'null'] },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
      },
    },
  },
  '/api/v1/dispatcher/monitor': {
    get: {
      tags: ['Dispatcher'],
      summary: 'The live monitor board',
      description:
        'Returns the watched reports (`submitted`, `routed`, `in_progress`, `resolved`) with their recent trail steps, plus the flow, response-time and crew-load charts.',
      operationId: 'dispatcherMonitor',
      parameters: [
        queryParam('filter', 'Which rows to include.', { type: 'string', enum: ['all', 'my_ward', 'my_crews'], default: 'all' }),
        queryParam('limit', 'Maximum rows to return.', { type: 'integer', minimum: 1, maximum: 200, default: 50 }),
        queryParam('cityId', 'Must match the session’s city, or the request is refused.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The monitor board.', {
          type: 'object',
          required: ['rows', 'charts', 'generatedAt'],
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  categoryId: { type: 'string' },
                  wardId: { type: 'string' },
                  wardName: { type: ['string', 'null'] },
                  assignedCrewId: { type: ['string', 'null'] },
                  updatedAt: { type: 'string', format: 'date-time' },
                  latestActivity: {
                    type: 'object',
                    properties: {
                      actorId: { type: ['string', 'null'] },
                      toStatus: { type: ['string', 'null'] },
                      timestamp: { type: 'string', format: 'date-time' },
                      unread: { type: 'boolean' },
                    },
                  },
                  trail: {
                    type: 'array',
                    description: 'The last three trail entries, oldest first.',
                    items: {
                      type: 'object',
                      properties: {
                        toStatus: { type: 'string' },
                        actorId: { type: ['string', 'null'] },
                        actorRole: { type: ['string', 'null'] },
                        note: { type: ['string', 'null'] },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  thumbnailUrl: { type: ['string', 'null'] },
                  photoCount: { type: 'integer' },
                },
              },
            },
            charts: {
              type: 'object',
              required: ['flow', 'response', 'crewLoad'],
              properties: {
                flow: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    segments: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { status: { type: 'string' }, count: { type: 'integer' } },
                      },
                    },
                  },
                },
                response: {
                  type: 'object',
                  properties: {
                    points: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          date: { type: 'string' },
                          avgMinutes: { type: 'number' },
                          samples: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
                crewLoad: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      crewId: { type: 'string' },
                      crewName: { type: 'string' },
                      openCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
        '500': jsonResponse('The board could not be assembled.', errorBody('monitor_read_failed')),
      },
    },
  },
  '/api/v1/dispatcher/monitor/ack': {
    post: {
      tags: ['Dispatcher'],
      summary: 'Acknowledge a monitor alert',
      description: 'Marks a monitor row as seen.',
      operationId: 'dispatcherMonitorAck',
      requestBody: jsonBody({
        type: 'object',
        required: ['ticketId'],
        properties: {
          ticketId: { type: 'string', minLength: 1 },
          note: { type: 'string', maxLength: 500 },
        },
      }),
      responses: {
        '200': jsonResponse('The alert was acknowledged.', {
          type: 'object',
          required: ['ticketId', 'acknowledgedAt'],
          properties: {
            ticketId: { type: 'string' },
            acknowledgedAt: { type: 'string', format: 'date-time' },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The report does not exist, or is outside the dispatcher’s scope.', errorBody('not_found')),
        '500': jsonResponse('The acknowledgement could not be recorded.', errorBody('monitor_ack_failed')),
      },
    },
  },
  '/api/v1/dispatcher/crew-for-ward': {
    get: {
      tags: ['Dispatcher'],
      summary: 'Crew eligible for a ward',
      description:
        'Lists the crew that can be assigned in a ward, ordered by current load (least busy first), then by name. When `categoryId` is supplied the crew are filtered to that category’s department, plus any crew with no department (general-purpose responders). Each entry carries the crew member’s `activeCount` — the number of active (non-terminal) reports they hold — and `atCapacity`, so the dispatcher can see who is already carrying their share. The assignment endpoint is the load-bearing check; this list is a hint.',
      operationId: 'dispatcherCrewForWard',
      parameters: [
        queryParam('wardId', 'The ward to list crew for.', { type: 'string', minLength: 1 }, { required: true }),
        queryParam('categoryId', 'Restrict to crew eligible for this category’s department.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The eligible crew.', {
          type: 'object',
          required: ['crew'],
          properties: {
            crew: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'name', 'activeCount', 'capacityLimit', 'atCapacity'],
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  activeCount: { type: 'integer', description: 'Active (non-terminal) reports currently assigned to this crew member.' },
                  capacityLimit: { type: 'integer', description: 'The maximum number of active reports one crew member may hold.' },
                  atCapacity: { type: 'boolean', description: 'True when the crew member is at or over the limit.' },
                },
              },
            },
          },
        }),
        '400': jsonResponse('Query validation failed, or the category is not in the session’s city.', {
          oneOf: [{ $ref: '#/components/responses/InvalidQuery' }, errorBody('category_not_in_city')],
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
      },
    },
  },
  '/api/v1/dispatcher/performance': {
    get: {
      tags: ['Dispatcher'],
      summary: 'The dispatcher performance snapshot',
      description:
        'Returns the reporting window’s headline numbers, breakdowns by category and status, a per-crew table, and the ten oldest unresolved reports.',
      operationId: 'dispatcherPerformance',
      parameters: [
        queryParam('from', 'Start of the reporting window (ISO 8601).', { type: 'string', format: 'date-time' }),
        queryParam('to', 'End of the reporting window (ISO 8601).', { type: 'string', format: 'date-time' }),
        queryParam('days', 'Window length in days when `from`/`to` are omitted.', { type: 'integer', minimum: 1, maximum: 90, default: 7 }),
        queryParam('cityId', 'Must match the session’s city, or the request is refused.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The performance snapshot.', {
          type: 'object',
          properties: {
            hero: {
              type: 'object',
              properties: {
                totalReports: {
                  type: 'object',
                  properties: { value: { type: 'number' }, delta: { type: 'number' } },
                },
                resolutionRate: {
                  type: 'object',
                  properties: { value: { type: 'number' }, delta: { type: 'number' } },
                },
                avgTimeToResolve: {
                  type: 'object',
                  properties: { valueMs: { type: 'number' }, deltaMs: { type: 'number' } },
                },
              },
            },
            submittedVsResolved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  submitted: { type: 'integer' },
                  resolved: { type: 'integer' },
                },
              },
            },
            categoryBreakdown: {
              type: 'array',
              items: {
                type: 'object',
                properties: { categoryId: { type: 'string' }, count: { type: 'integer' } },
              },
            },
            statusBreakdown: {
              type: 'array',
              items: {
                type: 'object',
                properties: { status: { type: 'string' }, count: { type: 'integer' } },
              },
            },
            crewTable: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  crewId: { type: 'string' },
                  crewName: { type: 'string' },
                  specialty: { type: ['string', 'null'] },
                  jobsCompleted: { type: 'integer' },
                  avgTimeToResolveMs: { type: ['number', 'null'] },
                  positiveFeedback: { type: 'integer' },
                  negativeFeedback: { type: 'integer' },
                  feedbackRatio: { type: ['number', 'null'], description: 'Null until a crew has at least five ratings.' },
                },
              },
            },
            longTail: {
              type: 'array',
              description: 'The ten oldest unresolved reports.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  categoryId: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  ageMs: { type: 'number' },
                  assignedCrewId: { type: ['string', 'null'] },
                  assignedCrewName: { type: ['string', 'null'] },
                },
              },
            },
            range: {
              type: 'object',
              properties: { fromIso: { type: 'string' }, toIso: { type: 'string' } },
            },
            ward: {
              type: 'object',
              properties: {
                wardId: { type: ['string', 'null'] },
                wardLabel: { type: ['string', 'null'] },
                wardLabelBn: { type: ['string', 'null'] },
              },
            },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
        '500': jsonResponse('The snapshot could not be assembled.', errorBody('performance_read_failed')),
      },
    },
  },
  '/api/v1/dispatcher/dedup-flags': {
    get: {
      tags: ['Dispatcher'],
      summary: 'Pending duplicate flags',
      description:
        'Lists the dedup flags awaiting a dispatcher decision, with both the newly-filed report and the report it may duplicate.',
      operationId: 'dispatcherDedupFlags',
      parameters: [queryParam('limit', 'Maximum flags to return.', { type: 'integer', minimum: 1, maximum: 100, default: 50 })],
      responses: {
        '200': jsonResponse('The pending flags.', {
          type: 'object',
          required: ['flags'],
          properties: {
            flags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  cityId: { type: 'string' },
                  wardId: { type: 'string' },
                  departmentId: { type: 'string' },
                  citizenReason: { type: 'string' },
                  flaggedAt: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                  ticket: { oneOf: [{ $ref: '#/components/schemas/SerializedTicket' }, { type: 'null' }] },
                  originalTicket: { oneOf: [{ $ref: '#/components/schemas/SerializedTicket' }, { type: 'null' }] },
                },
              },
            },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/api/v1/dispatcher/dedup-flags/{id}/confirm': {
    parameters: [pathParam('id', 'The dedup flag identifier.')],
    post: {
      tags: ['Dispatcher'],
      summary: 'Confirm a duplicate',
      description:
        'Confirms that the newly-filed report duplicates an existing one. The new report is closed with the reason `duplicate` and linked to the original. The request body is ignored.',
      operationId: 'dispatcherConfirmDedupFlag',
      responses: {
        '200': jsonResponse('The flag was confirmed.', {
          type: 'object',
          required: ['status', 'flagId', 'ticket'],
          properties: {
            status: { type: 'string', enum: ['confirmed'] },
            flagId: { type: 'string' },
            ticket: { $ref: '#/components/schemas/SerializedTicket' },
          },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The flag does not exist, is not pending, or is outside the dispatcher’s scope.', errorBody('not_found')),
        '500': jsonResponse('The confirmation could not be completed.', errorBody('post_confirm_fetch_failed')),
      },
    },
  },
  '/api/v1/dispatcher/dedup-flags/{id}/dismiss': {
    parameters: [pathParam('id', 'The dedup flag identifier.')],
    post: {
      tags: ['Dispatcher'],
      summary: 'Dismiss a duplicate flag',
      description:
        'Dismisses the flag — the two reports are not duplicates. The newly-filed report returns to the triage queue. The request body is ignored.',
      operationId: 'dispatcherDismissDedupFlag',
      responses: {
        '200': jsonResponse('The flag was dismissed.', {
          type: 'object',
          required: ['status', 'flagId', 'ticket'],
          properties: {
            status: { type: 'string', enum: ['dismissed'] },
            flagId: { type: 'string' },
            ticket: { $ref: '#/components/schemas/SerializedTicket' },
          },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The flag does not exist, is not pending, or is outside the dispatcher’s scope.', errorBody('not_found')),
        '500': jsonResponse('The dismissal could not be completed.', errorBody('post_dismiss_fetch_failed')),
      },
    },
  },
  '/api/v1/dispatcher/tickets/{id}': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    get: {
      tags: ['Dispatcher'],
      summary: 'Read a report as a dispatcher',
      description: 'Returns the report with its internal note, assigned crew and un-anonymised trail.',
      operationId: 'dispatcherGetTicket',
      responses: {
        '200': jsonResponse('The report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The report does not exist, or is outside the dispatcher’s scope.', errorBody('not_found')),
      },
    },
    patch: {
      tags: ['Dispatcher'],
      summary: 'Reassign a report or edit its internal note',
      description:
        'Moves a report to a different ward or category, or edits the internal note the citizen never sees. Changing the ward or category writes a `reassign` audit row; changing the note writes an `internal_note` row.',
      operationId: 'dispatcherUpdateTicket',
      requestBody: jsonBody(
        {
          type: 'object',
          properties: {
            wardId: { type: 'string', minLength: 1 },
            categoryId: { type: 'string', minLength: 1 },
            internalNote: { type: 'string', maxLength: 4000 },
          },
        },
        { required: false },
      ),
      responses: {
        '200': jsonResponse('The updated report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('Validation failed, or the ward/category does not exist in the session’s city.', {
          oneOf: [issuesBody('invalid_input'), errorBody('invalid_ward'), errorBody('invalid_category'), errorBody('cross_city_access_denied')],
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The report does not exist, or is outside the dispatcher’s scope.', errorBody('not_found')),
        '500': jsonResponse('The change could not be read back.', errorBody('post_patch_fetch_failed')),
      },
    },
  },
  '/api/v1/dispatcher/tickets/{id}/transition': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Dispatcher'],
      summary: 'Advance a report’s status as a dispatcher',
      description:
        'A dispatcher may move a report to `routed` or `cancelled`. Moving it to `in_progress` or `resolved` is refused — that is the crew’s transition.',
      operationId: 'dispatcherTransitionTicket',
      requestBody: jsonBody({
        type: 'object',
        required: ['toStatus'],
        properties: {
          toStatus: { type: 'string', enum: ['routed', 'in_progress', 'resolved', 'cancelled'] },
          note: { type: 'string', maxLength: 1000 },
        },
      }),
      responses: {
        '200': jsonResponse('The transitioned report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('This role may not perform that transition.', errorBody('role_cannot_perform_transition')),
        '404': jsonResponse('The report does not exist, or is outside the dispatcher’s scope.', errorBody('not_found')),
        '422': jsonResponse('The transition is not legal from the report’s current status.', errorBody('illegal_transition', { from_status: { type: 'string' }, to_status: { type: 'string' } })),
        '500': jsonResponse('The transition could not be applied.', errorBody('transition_failed', { detail: { type: 'string' } })),
      },
    },
  },
  '/api/v1/dispatcher/tickets/{id}/assign-crew': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Dispatcher'],
      summary: 'Assign a crew member to a report',
      description:
        'Assigns a crew member, or clears the assignment by sending `null`. The crew member must exist, be a crew role, and belong to the report’s ward and department — otherwise the assignment would be invisible to them. A crew member already holding the maximum number of active reports is refused with `409 crew_at_capacity`; the report being assigned is excluded from that count, so re-assigning a report the member already holds is never blocked by capacity.',
      operationId: 'dispatcherAssignCrew',
      requestBody: jsonBody({
        type: 'object',
        required: ['assignedCrewId'],
        properties: {
          assignedCrewId: { type: ['string', 'null'], minLength: 1, description: 'The crew user id, or null to clear the assignment.' },
        },
      }),
      responses: {
        '200': jsonResponse('The report with its assignment.', {
          type: 'object',
          required: ['ticket', 'changed'],
          properties: {
            ticket: { $ref: '#/components/schemas/SerializedTicket' },
            changed: { type: 'boolean', description: 'False when the requested value already matched.' },
          },
        }),
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('The target user is not crew, or is outside the report’s ward or department.', {
          oneOf: [
            errorBody('forbidden_role'),
            errorBody('cross_ward_access_denied'),
            errorBody('cross_department_access_denied'),
          ],
        }),
        '404': jsonResponse('The report, or the target crew member, does not exist.', errorBody('not_found')),
        '409': jsonResponse('Another writer changed the report first, or the crew member is already at capacity.', {
          oneOf: [
            errorBody('concurrent_write'),
            errorBody('crew_at_capacity'),
          ],
        }),
        '500': jsonResponse('The assignment could not be read back.', errorBody('post_assign_fetch_failed')),
      },
    },
  },

  // -- Crew ----------------------------------------------------------------
  '/api/v1/crew/tickets': {
    get: {
      tags: ['Crew'],
      summary: 'The crew member’s work list',
      description:
        'Returns the reports assigned to the signed-in crew member, scoped to their ward and department. A crew member with no department sees every report in their ward.',
      operationId: 'crewListTickets',
      parameters: [
        queryParam('status', 'Filter by status. Omit to include both `routed` and `in_progress`.', { type: 'string', enum: ['routed', 'in_progress'] }),
        queryParam('limit', 'Maximum rows to return.', { type: 'integer', minimum: 1, maximum: 100, default: 50 }),
        queryParam('cityId', 'Must match the session’s city, or the request is refused.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The work list.', {
          type: 'object',
          required: ['tickets'],
          properties: { tickets: { type: 'array', items: { $ref: '#/components/schemas/SerializedTicket' } } },
        }),
        '400': { $ref: '#/components/responses/InvalidQuery' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Wrong role, or the city does not match the session.', {
          oneOf: [{ $ref: '#/components/responses/Forbidden' }, errorBody('cross_city_access_denied')],
        }),
      },
    },
  },
  '/api/v1/crew/tickets/{id}': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    get: {
      tags: ['Crew'],
      summary: 'Read a report as a crew member',
      description: 'Returns the report, but only if it is assigned to the signed-in crew member.',
      operationId: 'crewGetTicket',
      responses: {
        '200': jsonResponse('The report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The report does not exist, is outside the crew member’s scope, or is not assigned to them.', errorBody('not_found')),
      },
    },
  },
  '/api/v1/crew/tickets/{id}/transition': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Crew'],
      summary: 'Advance a report’s status as a crew member',
      description:
        'A crew member may move an assigned report to `in_progress` or `resolved`; `cancelled` is refused. A `note` is required when resolving.',
      operationId: 'crewTransitionTicket',
      requestBody: jsonBody({
        type: 'object',
        required: ['toStatus'],
        properties: {
          toStatus: { type: 'string', enum: ['in_progress', 'resolved', 'cancelled'] },
          note: { type: 'string', maxLength: 1000, description: 'Required when `toStatus` is `resolved`.' },
        },
      }),
      responses: {
        '200': jsonResponse('The transitioned report.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('Validation failed — including a missing resolution note.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('This role may not perform that transition.', errorBody('role_cannot_perform_transition')),
        '404': jsonResponse('The report does not exist, is outside the crew member’s scope, or is not assigned to them.', errorBody('not_found')),
        '422': jsonResponse('The transition is not legal from the report’s current status.', errorBody('illegal_transition', { from_status: { type: 'string' }, to_status: { type: 'string' } })),
        '500': jsonResponse('The transition could not be applied.', errorBody('transition_failed', { detail: { type: 'string' } })),
      },
    },
  },
  '/api/v1/crew/tickets/{id}/photos': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    post: {
      tags: ['Crew'],
      summary: 'Attach an after-photo to a report',
      description:
        'Records the crew’s “after” evidence on an assigned report. Send either a stored `url`, or the raw bytes as `dataBase64` for the server to upload to the blob store.',
      operationId: 'crewAddPhoto',
      requestBody: jsonBody({
        oneOf: [
          {
            type: 'object',
            required: ['url'],
            properties: { url: { $ref: '#/components/schemas/PhotoUrl' } },
          },
          {
            type: 'object',
            required: ['dataBase64', 'mimeType'],
            properties: {
              dataBase64: { type: 'string', minLength: 1, maxLength: 7000000 },
              mimeType: { type: 'string', minLength: 1, maxLength: 100 },
              fileName: { type: 'string', maxLength: 255 },
            },
          },
        ],
      }),
      responses: {
        '200': jsonResponse('The report with the new photo.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '400': jsonResponse('Validation failed, or the MIME type is not an allowed image.', issuesBody('invalid_input')),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('The report does not exist, is outside the crew member’s scope, or is not assigned to them.', errorBody('not_found')),
        '413': jsonResponse('The photo exceeded the size limit.', errorBody('photo_too_large', { max_chars: { type: 'integer' } })),
        '500': jsonResponse('The report could not be read back.', errorBody('post_photo_fetch_failed')),
        '502': jsonResponse('The blob store rejected the upload.', errorBody('photo_storage_failed', { detail: { type: 'string' } })),
      },
    },
  },

  // -- Activity ------------------------------------------------------------
  '/api/v1/activity': {
    get: {
      tags: ['Activity'],
      summary: 'The signed-in user’s activity feed',
      description:
        'Returns the city’s recent reports. The shape follows the session’s role — a citizen sees the anonymised citizen view, staff see the full record.',
      operationId: 'getActivity',
      parameters: [
        queryParam('status', 'Filter by status.', { type: 'string', enum: ['submitted', 'routed', 'in_progress', 'resolved', 'closed', 'cancelled'] }),
        queryParam('limit', 'Maximum rows to return.', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
      ],
      responses: {
        '200': jsonResponse('The activity feed.', {
          type: 'object',
          required: ['tickets'],
          properties: { tickets: { type: 'array', items: { $ref: '#/components/schemas/SerializedTicket' } } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/api/v1/activity/public': {
    get: {
      tags: ['Activity'],
      summary: 'The public city activity feed',
      description:
        'An anonymous feed of recent reports, stripped of reporter identity, internal notes, assigned crew, trail and location label. Degrades to an empty feed rather than failing when the database is unreachable.',
      operationId: 'getPublicActivity',
      parameters: [
        queryParam('cityId', 'The city to show. Defaults to the session’s city, then to the first city by creation date.', { type: 'string', minLength: 1 }),
        queryParam('limit', 'Maximum rows to return.', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
        queryParam('status', 'A status group to narrow the feed to. The groups are what a citizen thinks in, not the internal status enum: "new" = submitted + routed, "active" = in_progress, "resolved" = resolved + closed + cancelled.', {
          type: 'string',
          enum: ['all', 'new', 'active', 'resolved'],
          default: 'all',
        }),
        queryParam('ward', 'A ward to narrow the feed to — the ward number ("14") or the ward id. Filters over the city’s full ticket list, combined with `status` using AND. An unknown ward yields an empty feed rather than an error.', { type: 'string', minLength: 1 }),
        queryParam('cursor', 'An opaque pagination token taken from the previous page’s `nextCursor`. Omit it for the first page. A malformed cursor falls back to the first page rather than erroring.', { type: 'string', minLength: 1 }),
      ],
      responses: {
        '200': jsonResponse('The public feed.', {
          type: 'object',
          required: ['tickets', 'categories', 'wards', 'stats', 'nextCursor', 'total'],
          properties: {
            tickets: { type: 'array', items: { $ref: '#/components/schemas/PublicSerializedTicket' } },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  nameBn: { type: ['string', 'null'] },
                },
              },
            },
            wards: {
              type: 'array',
              description:
                'The city’s ward list, with each ward’s report count computed over the FULL ticket set (so it does not change with the active status filter).',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  number: { type: 'integer' },
                  name: { type: 'string' },
                  nameBn: { type: ['string', 'null'] },
                  count: { type: 'integer' },
                },
              },
            },
            stats: {
              type: 'object',
              description:
                'The city-wide counters behind the landing page’s stats row and filter chips. The chip counts do NOT change with the active filter — they describe the whole city.',
              properties: {
                reportsThisMonth: { type: 'integer' },
                resolvedThisMonth: { type: 'integer' },
                resolutionRate: { type: 'integer', description: 'Percentage, 0-100.' },
                avgDaysToResolve: { type: 'number' },
                reportsLastMonth: {
                  type: 'integer',
                  description:
                    'Reports created in the previous calendar month — the comparison base for the landing page’s month-over-month trend line.',
                },
                trend: {
                  type: 'string',
                  enum: ['up', 'down', 'flat', 'none'],
                  description:
                    'The month-over-month direction derived from reportsThisMonth vs reportsLastMonth. "none" means there was no previous month to compare against, so no trend is claimed — it is NOT the same as "flat".',
                },
                counts: {
                  type: 'object',
                  properties: {
                    all: { type: 'integer' },
                    new: { type: 'integer' },
                    active: { type: 'integer' },
                    resolved: { type: 'integer' },
                  },
                },
              },
            },
            nextCursor: {
              type: ['string', 'null'],
              description:
                'The opaque pagination token for the next page, or null when this is the last page. Pass it back as the `cursor` query parameter to continue. The token encodes a ticket’s creation timestamp AND its id — the timestamp alone is not unique, so a cursor without the id would either drop or repeat the tickets that share a timestamp.',
            },
            total: {
              type: 'integer',
              description:
                'How many tickets the active filter matches — the denominator for the feed’s "showing X of Y" line. Unlike the chip counts in `stats`, this is scoped to the active `status`/`ward` filter.',
            },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
      },
    },
  },

  // -- Misc ----------------------------------------------------------------
  '/api/v1/push/subscribe': {
    post: {
      tags: ['Misc'],
      summary: 'Subscribe to push notifications',
      description: 'Registers a Web Push subscription for the signed-in citizen.',
      operationId: 'subscribePush',
      requestBody: jsonBody({
        type: 'object',
        required: ['endpoint', 'keys'],
        properties: {
          endpoint: { type: 'string', format: 'uri' },
          keys: {
            type: 'object',
            required: ['p256dh', 'auth'],
            properties: {
              p256dh: { type: 'string', minLength: 1 },
              auth: { type: 'string', minLength: 1 },
            },
          },
        },
      }),
      responses: {
        '200': OK_RESPONSE,
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('No session, or the session is not a citizen.', {
          oneOf: [errorBody('not_authenticated'), errorBody('forbidden_role')],
        }),
      },
    },
    delete: {
      tags: ['Misc'],
      summary: 'Unsubscribe from push notifications',
      operationId: 'unsubscribePush',
      requestBody: jsonBody({
        type: 'object',
        required: ['endpoint'],
        properties: { endpoint: { type: 'string', format: 'uri' } },
      }),
      responses: {
        '200': OK_RESPONSE,
        '400': jsonResponse('Validation failed.', issuesBody('invalid_input')),
        '401': jsonResponse('No session, or the session is not a citizen.', {
          oneOf: [errorBody('not_authenticated'), errorBody('forbidden_role')],
        }),
      },
    },
  },
  '/api/report/bootstrap': {
    get: {
      tags: ['Misc'],
      summary: 'Bootstrap the report flow',
      description:
        'Returns everything the report form needs in one request: the city, the citizen’s ward, and the city’s categories.',
      operationId: 'reportBootstrap',
      responses: {
        '200': jsonResponse('The report bootstrap payload.', {
          type: 'object',
          required: ['city', 'ward', 'categories'],
          properties: {
            city: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                nameBn: { type: ['string', 'null'] },
                defaultLanguage: { type: 'string' },
              },
            },
            ward: { oneOf: [{ $ref: '#/components/schemas/Ward' }, { type: 'null' }] },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  nameBn: { type: ['string', 'null'] },
                  narrowCategoryPhotoCap: { type: ['integer', 'null'] },
                },
              },
            },
          },
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': jsonResponse('Only citizens file reports.', errorBody('citizen_only')),
        '404': jsonResponse('The session’s city does not exist.', errorBody('city_not_found')),
      },
    },
  },
  '/api/profile': {
    get: {
      tags: ['Misc'],
      summary: 'Read the signed-in user’s profile',
      description: 'Returns the profile without the password hash, NID, ward, department or session id.',
      operationId: 'getProfile',
      responses: {
        '200': jsonResponse('The profile.', {
          type: 'object',
          required: ['profile'],
          properties: { profile: { $ref: '#/components/schemas/Profile' } },
        }),
        '401': jsonResponse('No session. This route reports a missing session as `unauthenticated`.', errorBody('unauthenticated')),
        '404': jsonResponse('The session’s user no longer exists.', errorBody('user_not_found')),
      },
    },
    put: {
      tags: ['Misc'],
      summary: 'Update the signed-in user’s profile',
      description:
        'Only the display names are writable, and only on the caller’s OWN row — the write is scoped to the session’s user, so one user can never edit another’s profile.\n\n' +
        'ADR-007: an ADMIN write is an admin write wherever it lives, so it requires a fresh WebAuthn assertion. A citizen / dispatcher / crew write to their own profile is NOT an admin write and is not gated. The body is validated BEFORE the ceremony (ADR-007 guard ordering), so a malformed request gets a 400 rather than being sent through a hardware-key prompt it could never satisfy.',
      operationId: 'updateProfile',
      requestBody: jsonBody({
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 80, description: 'Trimmed. Must be non-empty and free of control characters.' },
          nameBn: { type: ['string', 'null'], maxLength: 80, description: 'Trimmed. Optional; `null` or empty clears it.' },
        },
      }),
      responses: {
        '200': jsonResponse('The updated profile.', {
          type: 'object',
          required: ['profile'],
          properties: { profile: { $ref: '#/components/schemas/Profile' } },
        }),
        '400': jsonResponse('The body was invalid. The Zod issues are in `issues`.', issuesBody('invalid_input')),
        '401': jsonResponse('No session, or the admin’s WebAuthn gate refused the write.', {
          oneOf: [
            errorBody('unauthenticated'),
            errorBody('webauthn_required'),
            errorBody('webauthn_assertion_expired'),
          ],
        }),
        '404': jsonResponse('The session’s user no longer exists.', errorBody('user_not_found')),
      },
    },
  },

  // -------------------------------------------------------------------------
  // Admin
  //
  // Every admin route reports a missing session as `unauthenticated` (not
  // `not_authenticated`). Reads need only the `admin` role; every write
  // additionally requires a fresh WebAuthn assertion (ADR-007).
  //
  // Note the tree shape: cities are the root, and categories, departments,
  // wards, users and adoption hang off `/api/v1/admin/cities/{id}/…`.
  // The only admin routes outside that subtree are `/api/v1/admin/tickets`,
  // `/api/v1/admin/tickets/{id}` and `/api/v1/admin/audit`.
  // -------------------------------------------------------------------------
  '/api/v1/admin/cities': {
    get: {
      tags: ['Admin'],
      summary: 'List cities',
      description:
        'Returns every city with a derived `status` (`live` once it has at least one ward, category and department; `setup` otherwise) and a `counts` block.',
      operationId: 'adminListCities',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The cities.', {
          type: 'object',
          required: ['cities'],
          properties: {
            cities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  nameBn: { type: ['string', 'null'] },
                  defaultLanguage: { type: 'string', enum: ['bn', 'en'] },
                  dedupRadiusMeters: { type: 'integer' },
                  status: { type: 'string', enum: ['live', 'setup'] },
                  counts: {
                    type: 'object',
                    properties: {
                      dispatchers: { type: 'integer', description: 'Always 0 in this build.' },
                      crews: { type: 'integer', description: 'Always 0 in this build.' },
                      ticketsPerDay: { type: 'integer', description: 'Always 0 in this build.' },
                      wards: { type: 'integer' },
                      categories: { type: 'integer' },
                      departments: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a city',
      description:
        'Requires a fresh WebAuthn assertion. With `applyDhakaTemplate: true` the city is seeded with departments, categories and wards; if the template collides on a unique constraint the city is still created and the response is 200 with `templateError` instead of 201.',
      operationId: 'adminCreateCity',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-z0-9-]+$' },
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          defaultLanguage: { type: 'string', enum: ['bn', 'en'], default: 'bn' },
          dedupRadiusMeters: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          applyDhakaTemplate: { type: 'boolean', default: false },
        },
      }),
      responses: {
        '200': jsonResponse('The city was created, but the Dhaka template could not be applied.', {
          type: 'object',
          required: ['city', 'templateError'],
          properties: {
            city: { $ref: '#/components/schemas/City' },
            templateError: { type: 'string', enum: ['template_already_applied'] },
          },
        }),
        '201': jsonResponse('The city was created.', {
          type: 'object',
          required: ['city'],
          properties: {
            city: { $ref: '#/components/schemas/City' },
            templateResult: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    departmentsCreated: { type: 'integer' },
                    categoriesCreated: { type: 'integer' },
                    wardsCreated: { type: 'integer' },
                  },
                },
                { type: 'null' },
              ],
              description: 'Null when `applyDhakaTemplate` was not requested.',
            },
          },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': jsonResponse('A city with this slug already exists.', errorBody('city_slug_taken')),
      },
    },
  },
  '/api/v1/admin/cities/{id}': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'Read a city',
      operationId: 'adminGetCity',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The city.', {
          type: 'object',
          required: ['city'],
          properties: { city: { $ref: '#/components/schemas/City' } },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
    patch: {
      tags: ['Admin'],
      summary: 'Update a city',
      description: 'Requires a fresh WebAuthn assertion. The slug is not writable.',
      operationId: 'adminUpdateCity',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          defaultLanguage: { type: 'string', enum: ['bn', 'en'] },
          dedupRadiusMeters: { type: 'integer', minimum: 1, maximum: 500 },
        },
      }),
      responses: {
        '200': jsonResponse('The updated city.', {
          type: 'object',
          required: ['city'],
          properties: { city: { $ref: '#/components/schemas/City' } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a city',
      description:
        'Requires a fresh WebAuthn assertion. This is a hard delete (ADR-009) — the Prisma path cascades through the `onDelete: Cascade` chain.',
      operationId: 'adminDeleteCity',
      security: SESSION_SECURITY,
      responses: {
        '200': OK_RESPONSE,
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/categories': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'List a city’s categories',
      operationId: 'adminListCategories',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The categories.', {
          type: 'object',
          required: ['categories'],
          properties: {
            categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
          },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a category',
      description: 'Requires a fresh WebAuthn assertion.',
      operationId: 'adminCreateCategory',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-z0-9-]+$' },
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          departmentId: {
            type: ['string', 'null'],
            description: 'Must belong to the same city.',
          },
          narrowCategoryPhotoCap: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        },
      }),
      responses: {
        '201': jsonResponse('The category was created.', {
          type: 'object',
          required: ['category'],
          properties: { category: { $ref: '#/components/schemas/Category' } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id, or the department does not belong to it.', {
          oneOf: [errorBody('city_not_found'), errorBody('department_not_found')],
        }),
      },
    },
  },
  '/api/v1/admin/cities/{id}/categories/{catId}': {
    parameters: [{ $ref: '#/components/parameters/CityId' }, { $ref: '#/components/parameters/CategoryId' }],
    patch: {
      tags: ['Admin'],
      summary: 'Update a category',
      description: 'Requires a fresh WebAuthn assertion. The slug is not writable.',
      operationId: 'adminUpdateCategory',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          departmentId: { type: ['string', 'null'] },
          narrowCategoryPhotoCap: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        },
      }),
      responses: {
        '200': jsonResponse('The updated category.', {
          type: 'object',
          required: ['category'],
          properties: { category: { $ref: '#/components/schemas/Category' } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no category with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('category_not_found')],
        }),
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a category',
      description:
        'Requires a fresh WebAuthn assertion. Refused with 409 while any ticket still references the category.',
      operationId: 'adminDeleteCategory',
      security: SESSION_SECURITY,
      responses: {
        '200': OK_RESPONSE,
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no category with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('category_not_found')],
        }),
        '409': jsonResponse('Tickets still reference this category.', {
          type: 'object',
          required: ['error', 'count'],
          properties: {
            error: { type: 'string', enum: ['category_has_tickets'] },
            count: { type: 'integer', description: 'The number of bound tickets.' },
          },
        }),
      },
    },
  },
  '/api/v1/admin/cities/{id}/departments': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'List a city’s departments',
      operationId: 'adminListDepartments',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The departments.', {
          type: 'object',
          required: ['departments'],
          properties: {
            departments: { type: 'array', items: { $ref: '#/components/schemas/Department' } },
          },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a department',
      description:
        'Requires a fresh WebAuthn assertion. `contactInfo` is accepted and validated but is **not persisted** in this build.',
      operationId: 'adminCreateDepartment',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-z0-9-]+$' },
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          contactInfo: { type: ['string', 'null'], maxLength: 120, description: 'Validated but not persisted.' },
        },
      }),
      responses: {
        '201': jsonResponse('The department was created.', {
          type: 'object',
          required: ['department'],
          properties: { department: { $ref: '#/components/schemas/Department' } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/departments/{deptId}': {
    parameters: [{ $ref: '#/components/parameters/CityId' }, { $ref: '#/components/parameters/DepartmentId' }],
    patch: {
      tags: ['Admin'],
      summary: 'Update a department',
      description: 'Requires a fresh WebAuthn assertion. The slug is not writable.',
      operationId: 'adminUpdateDepartment',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          contactInfo: { type: ['string', 'null'], maxLength: 120, description: 'Validated but not persisted.' },
        },
      }),
      responses: {
        '200': jsonResponse('The updated department.', {
          type: 'object',
          required: ['department'],
          properties: { department: { $ref: '#/components/schemas/Department' } },
        }),
        '400': { $ref: '#/components/responses/InvalidInput' },
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no department with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('department_not_found')],
        }),
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a department',
      description:
        'Requires a fresh WebAuthn assertion. Refused with 409 while any category still references the department.',
      operationId: 'adminDeleteDepartment',
      security: SESSION_SECURITY,
      responses: {
        '200': OK_RESPONSE,
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no department with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('department_not_found')],
        }),
        '409': jsonResponse('Categories still reference this department.', {
          type: 'object',
          required: ['error', 'count', 'categoryIds'],
          properties: {
            error: { type: 'string', enum: ['department_has_categories'] },
            count: { type: 'integer', description: 'The number of bound categories.' },
            categoryIds: { type: 'array', items: { type: 'string' } },
          },
        }),
      },
    },
  },
  '/api/v1/admin/cities/{id}/wards': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'List a city’s wards',
      operationId: 'adminListWards',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The wards.', {
          type: 'object',
          required: ['wards'],
          properties: {
            wards: { type: 'array', items: { $ref: '#/components/schemas/Ward' } },
          },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a ward',
      description:
        'Requires a fresh WebAuthn assertion. `polygonGeoJson` is validated by `lib/admin/ward-polygon.ts`; a rejected polygon returns 400 with the validator’s error code.',
      operationId: 'adminCreateWard',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['number', 'name'],
        properties: {
          number: { type: 'integer', minimum: 1, maximum: 200 },
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          polygonGeoJson: { $ref: '#/components/schemas/WardPolygon' },
        },
      }),
      responses: {
        '201': jsonResponse('The ward was created.', {
          type: 'object',
          required: ['ward'],
          properties: { ward: { $ref: '#/components/schemas/Ward' } },
        }),
        '400': jsonResponse('The body or the polygon was rejected.', {
          oneOf: [
            issuesBody('invalid_input'),
            errorBody('invalid_polygon'),
            errorBody('polygon_not_closed'),
            errorBody('polygon_too_few_vertices'),
            errorBody('coordinates_out_of_range'),
          ],
        }),
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/wards/{wardId}': {
    parameters: [{ $ref: '#/components/parameters/CityId' }, { $ref: '#/components/parameters/WardId' }],
    patch: {
      tags: ['Admin'],
      summary: 'Update a ward',
      description:
        'Requires a fresh WebAuthn assertion. The ward `number` is **not** patchable, and the slug/name fields are limited to `name` and `nameBn`.',
      operationId: 'adminUpdateWard',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60 },
          nameBn: { type: ['string', 'null'], maxLength: 60 },
          polygonGeoJson: {
            oneOf: [{ $ref: '#/components/schemas/WardPolygon' }, { type: 'null' }],
            description: '`null` clears the stored polygon.',
          },
        },
      }),
      responses: {
        '200': jsonResponse('The updated ward.', {
          type: 'object',
          required: ['ward'],
          properties: { ward: { $ref: '#/components/schemas/Ward' } },
        }),
        '400': jsonResponse('The body or the polygon was rejected.', {
          oneOf: [
            issuesBody('invalid_input'),
            errorBody('invalid_polygon'),
            errorBody('polygon_not_closed'),
            errorBody('polygon_too_few_vertices'),
            errorBody('coordinates_out_of_range'),
          ],
        }),
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no ward with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('ward_not_found')],
        }),
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a ward',
      description:
        'Requires a fresh WebAuthn assertion. Refused with 409 while any ticket still references the ward.',
      operationId: 'adminDeleteWard',
      security: SESSION_SECURITY,
      responses: {
        '200': OK_RESPONSE,
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city, or no ward with this id in this city.', {
          oneOf: [errorBody('city_not_found'), errorBody('ward_not_found')],
        }),
        '409': jsonResponse('Tickets still reference this ward.', {
          type: 'object',
          required: ['error', 'count'],
          properties: {
            error: { type: 'string', enum: ['ward_has_tickets'] },
            count: { type: 'integer', description: 'The number of bound tickets.' },
          },
        }),
      },
    },
  },
  '/api/v1/admin/cities/{id}/users': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'List a city’s provisioned users',
      description:
        'Returns the user cards plus the reference data the admin console needs (wards, departments, crews) and a `canLaunch` readiness flag.',
      operationId: 'adminListUsers',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The users and their reference data.', {
          type: 'object',
          required: ['users', 'counts', 'crews', 'wards', 'departments', 'canLaunch'],
          properties: {
            users: { type: 'array', items: { $ref: '#/components/schemas/AdminUserCard' } },
            counts: {
              type: 'object',
              properties: {
                all: { type: 'integer' },
                dispatcher: { type: 'integer' },
                crew: { type: 'integer' },
                supervisor: { type: 'integer' },
              },
            },
            crews: { type: 'array', items: { $ref: '#/components/schemas/AdminCrew' } },
            wards: { type: 'array', items: { $ref: '#/components/schemas/Ward' } },
            departments: { type: 'array', items: { $ref: '#/components/schemas/Department' } },
            canLaunch: { type: 'boolean' },
          },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Provision one user',
      description:
        'Requires a fresh WebAuthn assertion. Scope rules are role-specific: a dispatcher needs at least one ward, a crew needs exactly one crew and one department, and a supervisor may take neither wards nor a crew.',
      operationId: 'adminCreateUser',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['nameBn', 'nameEn', 'identifier', 'role', 'password'],
        properties: {
          nameBn: { type: 'string', minLength: 1, maxLength: 120 },
          nameEn: { type: 'string', minLength: 1, maxLength: 120 },
          identifier: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'A mobile number or an email address. The kind is detected automatically.',
          },
          email: { type: 'string', maxLength: 160, description: 'Optional. Must be empty or a valid address.' },
          role: { type: 'string', enum: ['dispatcher', 'crew', 'supervisor'] },
          wardIds: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string' },
            description: 'Required for a dispatcher. The first id is stored on the row.',
          },
          crewId: { type: ['string', 'null'], description: 'Required for a crew.' },
          departmentId: { type: ['string', 'null'], description: 'Required for a crew.' },
          password: { type: 'string', minLength: 1, maxLength: 200, description: 'Must satisfy the initial-password policy.' },
          status: { type: 'string', enum: ['active', 'invited', 'disabled'], default: 'active' },
        },
      }),
      responses: {
        '201': jsonResponse('The user was provisioned.', {
          type: 'object',
          required: ['user'],
          properties: { user: { $ref: '#/components/schemas/AdminUser' } },
        }),
        '400': jsonResponse('The body, the identifier, the password or the role scope was rejected.', {
          oneOf: [
            issuesBody('invalid_input'),
            errorBody('identifier_required'),
            errorBody('identifier_too_long'),
            errorBody('identifier_invalid'),
            errorBody('identifier_email_conflict'),
            errorBody('password_too_short'),
            errorBody('password_needs_digit'),
            errorBody('password_needs_lowercase'),
            errorBody('password_needs_uppercase'),
            errorBody('dispatcher_needs_ward'),
            errorBody('ward_unknown'),
            errorBody('crew_needs_crew'),
            errorBody('crew_unknown'),
            errorBody('crew_needs_department'),
            errorBody('department_unknown'),
            errorBody('supervisor_takes_no_wards'),
            errorBody('supervisor_takes_no_crew'),
          ],
        }),
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': jsonResponse('The identifier is already taken in this city.', errorBody('identifier_taken')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/users/{userId}': {
    parameters: [{ $ref: '#/components/parameters/CityId' }, { $ref: '#/components/parameters/UserId' }],
    patch: {
      tags: ['Admin'],
      summary: 'Update a provisioned user',
      description: 'Requires a fresh WebAuthn assertion. Every field is optional.',
      operationId: 'adminUpdateUser',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          nameBn: { type: 'string', minLength: 1, maxLength: 120 },
          nameEn: { type: 'string', minLength: 1, maxLength: 120 },
          identifier: { type: 'string', minLength: 1, maxLength: 120 },
          email: { type: 'string', maxLength: 160 },
          role: { type: 'string', enum: ['dispatcher', 'crew', 'supervisor'] },
          wardIds: { type: 'array', maxItems: 20, items: { type: 'string' } },
          crewId: { type: ['string', 'null'] },
          departmentId: { type: ['string', 'null'] },
          password: { type: 'string', minLength: 1, maxLength: 200 },
          status: { type: 'string', enum: ['active', 'invited', 'disabled'] },
        },
      }),
      responses: {
        '200': jsonResponse('The updated user.', {
          type: 'object',
          required: ['user'],
          properties: { user: { $ref: '#/components/schemas/AdminUser' } },
        }),
        '400': jsonResponse('The body, the identifier, the password or the role scope was rejected.', {
          oneOf: [
            issuesBody('invalid_input'),
            errorBody('identifier_required'),
            errorBody('identifier_too_long'),
            errorBody('identifier_invalid'),
            errorBody('identifier_email_conflict'),
            errorBody('password_too_short'),
            errorBody('password_needs_digit'),
            errorBody('password_needs_lowercase'),
            errorBody('password_needs_uppercase'),
            errorBody('dispatcher_needs_ward'),
            errorBody('crew_needs_crew'),
            errorBody('crew_needs_department'),
            errorBody('supervisor_takes_no_wards'),
            errorBody('supervisor_takes_no_crew'),
          ],
        }),
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No user with this id in this city.', errorBody('user_not_found')),
        '409': jsonResponse('The identifier is already taken in this city.', errorBody('identifier_taken')),
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a provisioned user',
      description:
        'Requires a fresh WebAuthn assertion — deletion is destructive and irreversible. Refused with 409 when the user has reported or been assigned tickets.',
      operationId: 'adminDeleteUser',
      security: SESSION_SECURITY,
      responses: {
        '200': OK_RESPONSE,
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No user with this id in this city.', errorBody('user_not_found')),
        '409': jsonResponse('The user has reported or been assigned tickets.', errorBody('user_has_tickets')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/users/import': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    post: {
      tags: ['Admin'],
      summary: 'Bulk-provision users from CSV',
      description:
        'Requires a fresh WebAuthn assertion — a bad import can provision dozens of accounts at once. Every row is validated independently: good rows are created, bad rows are reported back with their row numbers and per-field error codes. The response is 400 when every row failed, and 200 otherwise.',
      operationId: 'adminImportUsers',
      security: SESSION_SECURITY,
      requestBody: jsonBody({
        type: 'object',
        required: ['csv'],
        properties: {
          csv: {
            type: 'string',
            maxLength: 524288,
            description:
              'The CSV document. Columns, in order: `name_bn,name_en,identifier,email,role,wards_or_crew,department`. The header row is optional.',
          },
          password: {
            type: 'string',
            maxLength: 200,
            description:
              'One shared initial password for every row. When omitted, a strong password is generated per row and returned ONCE in `created[].password` — it is never persisted.',
          },
          skipDuplicates: {
            type: 'boolean',
            default: true,
            description: 'Reserved. Duplicate identifiers are reported as failed rows either way.',
          },
        },
      }),
      responses: {
        '200': jsonResponse('The import ran. Some rows may still have failed.', {
          type: 'object',
          required: ['imported', 'failed', 'created', 'errors'],
          properties: {
            imported: { type: 'integer' },
            failed: { type: 'integer' },
            created: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rowNumber: { type: 'integer' },
                  id: { type: 'string' },
                  password: {
                    type: ['string', 'null'],
                    description: 'Null when a shared password was supplied. Surfaced once and never persisted.',
                  },
                },
              },
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rowNumber: { type: 'integer' },
                  errors: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        }),
        '400': jsonResponse('The body was invalid, or every row failed to import.', {
          oneOf: [
            issuesBody('invalid_input'),
            {
              type: 'object',
              required: ['imported', 'failed', 'created', 'errors'],
              properties: {
                imported: { type: 'integer' },
                failed: { type: 'integer' },
                created: { type: 'array', items: { type: 'object' } },
                errors: { type: 'array', items: { type: 'object' } },
              },
            },
          ],
        }),
        '401': jsonResponse('No admin session, or no fresh WebAuthn assertion.', {
          oneOf: [errorBody('unauthenticated'), errorBody('webauthn_required'), errorBody('webauthn_assertion_expired')],
        }),
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/api/v1/admin/cities/{id}/adoption': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'Read the adoption dashboard payload',
      description:
        'The 4.7 post-launch adoption dashboard. The window defaults to the city’s creation date through now. The payload is a snapshot — the page never polls.',
      operationId: 'adminAdoptionDashboard',
      security: SESSION_SECURITY,
      parameters: [
        queryParam('from', 'The inclusive lower bound of the window. A bare `YYYY-MM-DD` starts at 00:00:00Z.', { type: 'string' }),
        queryParam('to', 'The inclusive upper bound of the window. A bare `YYYY-MM-DD` ends at 23:59:59Z.', { type: 'string' }),
        queryParam('compare', 'Set to `1` to include the Dhaka overlay.', { type: 'string', enum: ['1', 'true'] }),
      ],
      responses: {
        '200': jsonResponse('The adoption dashboard.', { $ref: '#/components/schemas/AdoptionDashboard' }),
        '400': jsonResponse('The query was invalid, or the range was inverted.', {
          oneOf: [issuesBody('invalid_input'), errorBody('invalid_range')],
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': jsonResponse('No city with this id.', errorBody('city_not_found')),
      },
    },
  },
  '/api/v1/admin/cities/{id}/adoption/export': {
    parameters: [{ $ref: '#/components/parameters/CityId' }],
    get: {
      tags: ['Admin'],
      summary: 'Export the adoption dashboard as CSV',
      description:
        'Returns the daily activity series as `text/csv`. The header is `date,reports_submitted,reports_resolved,citizens_registered` and the rows are CRLF-terminated. The PDF export is not server-rendered — the page uses the browser print stylesheet instead.',
      operationId: 'adminAdoptionExport',
      security: SESSION_SECURITY,
      parameters: [
        queryParam('from', 'The inclusive lower bound of the window.', { type: 'string' }),
        queryParam('to', 'The inclusive upper bound of the window.', { type: 'string' }),
      ],
      responses: {
        '200': {
          description: 'The daily activity series as CSV.',
          content: { 'text/csv': { schema: { type: 'string' } } },
          headers: {
            'content-disposition': {
              description: 'Attachment filename, `adoption-{cityId}.csv`.',
              schema: { type: 'string' },
            },
          },
        },
        '400': jsonResponse('The query was invalid, or the range was inverted.', {
          oneOf: [issuesBody('invalid_input'), errorBody('invalid_range')],
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/api/v1/admin/tickets': {
    get: {
      tags: ['Admin'],
      summary: 'List tickets (admin Reports)',
      description:
        'Read-only. Admins are bound to a single city in v1; a `cityId` that differs from the session’s city is refused with 403 `cross_city_access_denied`.',
      operationId: 'adminListTickets',
      security: SESSION_SECURITY,
      parameters: [
        queryParam('status', 'Filter by a single status.', TICKET_STATUS_SCHEMA),
        queryParam('cityId', 'Must match the session’s city, or 403 `cross_city_access_denied`.', { type: 'string' }),
        queryParam('categoryId', 'Filter by category. An unknown category in this city returns 400 `invalid_category`.', { type: 'string' }),
        queryParam('wardId', 'Filter by ward. An unknown ward in this city returns 400 `invalid_ward`.', { type: 'string' }),
        queryParam('q', 'Exact-match ticket id.', { type: 'string' }),
        queryParam('from', 'Inclusive lower bound on `createdAt`. Defaults to now − 7 days.', { type: 'string', format: 'date-time' }),
        queryParam('to', 'Inclusive upper bound on `createdAt`. Defaults to now.', { type: 'string', format: 'date-time' }),
        { $ref: '#/components/parameters/Cursor' },
        { $ref: '#/components/parameters/Limit' },
      ],
      responses: {
        '200': jsonResponse('The tickets and the next cursor.', {
          type: 'object',
          required: ['tickets', 'nextCursor'],
          properties: {
            tickets: { type: 'array', items: { $ref: '#/components/schemas/SerializedTicket' } },
            nextCursor: { type: ['string', 'null'] },
          },
        }),
        '400': jsonResponse('The query, the ward or the category was invalid.', {
          oneOf: [issuesBody('invalid_input'), errorBody('invalid_ward'), errorBody('invalid_category')],
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': jsonResponse('The session is not an admin, or the city is outside the admin’s scope.', {
          oneOf: [errorBody('forbidden_role'), errorBody('cross_city_access_denied')],
        }),
      },
    },
  },
  '/api/v1/admin/tickets/{id}': {
    parameters: [{ $ref: '#/components/parameters/TicketId' }],
    get: {
      tags: ['Admin'],
      summary: 'Read one ticket (admin detail)',
      description:
        'Read-only. Returns the admin branch of the ticket serializer, so `internalNote`, `assignedCrewId` and the real trail `actorId` are all visible. Enforces the admin’s city scope.',
      operationId: 'adminGetTicket',
      security: SESSION_SECURITY,
      responses: {
        '200': jsonResponse('The ticket.', {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { $ref: '#/components/schemas/SerializedTicket' } },
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': jsonResponse('The session is not an admin, or the ticket is outside the admin’s city scope.', {
          oneOf: [errorBody('forbidden_role'), errorBody('cross_city_access_denied')],
        }),
        '404': jsonResponse('No ticket with this id.', errorBody('not_found')),
      },
    },
  },
  '/api/v1/admin/audit': {
    get: {
      tags: ['Admin'],
      summary: 'Read the audit log',
      description: 'Read-only. Cursor-paginated on the `createdAt` of the last row on the previous page.',
      operationId: 'adminListAuditEntries',
      security: SESSION_SECURITY,
      parameters: [
        queryParam('actorId', 'Exact-match actor id.', { type: 'string' }),
        queryParam('action', 'Comma-separated any-of action filter.', { type: 'string' }),
        queryParam('entityType', 'Comma-separated any-of entity-type filter.', {
          type: 'string',
          enum: ['ticket', 'city', 'category', 'department', 'ward', 'user'],
        }),
        queryParam('from', 'Inclusive lower bound on `createdAt`. Defaults to now − 7 days.', { type: 'string', format: 'date-time' }),
        queryParam('to', 'Inclusive upper bound on `createdAt`. Defaults to now.', { type: 'string', format: 'date-time' }),
        { $ref: '#/components/parameters/Cursor' },
        { $ref: '#/components/parameters/Limit' },
      ],
      responses: {
        '200': jsonResponse('The audit entries and the next cursor.', {
          type: 'object',
          required: ['entries', 'nextCursor'],
          properties: {
            entries: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } },
            nextCursor: { type: ['string', 'null'] },
          },
        }),
        '400': jsonResponse('The query was invalid.', {
          oneOf: [
            issuesBody('invalid_input'),
            {
              type: 'object',
              required: ['error'],
              properties: {
                error: { type: 'string', enum: ['invalid_input'] },
                detail: { type: 'string', description: 'Names the unknown entityType.' },
              },
            },
          ],
        }),
        '401': { $ref: '#/components/responses/UnauthenticatedAdmin' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
};

openapiSpec.paths = openapiPaths;
