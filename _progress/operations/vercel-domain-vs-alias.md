# Vercel: alias vs. tracked project domain

> Captured 2026-10-12 during the CityFix v1 v1.1 production
> URL switch. The two ways to point a `*.vercel.app` subdomain
> at a Vercel project are not equivalent — one tracks production
> deployments, the other doesn't. This file documents the
> difference, how to tell which one you have, and how to convert
> between them via the REST API.

## TL;DR

| Property | `vercel alias set` | `POST /v10/projects/{id}/domains` |
|---|---|---|
| Adds the subdomain to the project | ❌ (just an alias entry) | ✅ (real project domain) |
| Auto-promotes to the latest production build | ❌ | ✅ |
| Removed when the deployment is deleted | ✅ (recursively) | ❌ (survives as the domain is project-scoped) |
| Visible in `vercel domains ls` | ❌ | ✅ |
| Visible in `vercel alias ls` | ✅ | ✅ (plus tracked in dashboard) |
| Created via | `vercel alias set <deployment> <subdomain>` | Dashboard click or REST API |
| Reversible with | `vercel alias rm <subdomain>` | Dashboard or `DELETE /v9/projects/{id}/domains/{domain}` |

**Always use the tracked project domain for the public URL.**
Use ad-hoc `vercel alias` only for one-off pointers (e.g.
promoting a specific build for QA, aliasing a preview deployment
to a custom subdomain).

## What we did for CityFix

After the first attempt to claim `https://cityfix-bd.vercel.app`
via `vercel alias set`, we noticed the alias did **not** follow
the latest production build — it stayed pinned to the build
it was created against. The three auto-generated aliases
(`cityfix-theta.vercel.app`, etc.) **did** follow, because
Vercel auto-creates those as tracked production aliases when
the Vercel GitHub App integration is connected.

Fix: convert `cityfix-bd.vercel.app` from a one-shot alias to
a tracked project domain via the REST API:

```bash
curl -sS -X POST \
  "https://api.vercel.com/v10/projects/cityfix/domains" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"cityfix-bd.vercel.app"}'
```

Response:
```json
{
  "name": "cityfix-bd.vercel.app",
  "apexName": "vercel.app",
  "projectId": "prj_av0zjUFXBo9rO70j4EtMJGtTAHaE",
  "gitBranch": null,
  "verified": true
}
```

`gitBranch: null` means "production" (i.e. not pinned to a
git branch). After this, every new production build
auto-promotes to `cityfix-bd.vercel.app`.

## Why two different mechanisms exist

Vercel splits these on purpose:

- **`vercel alias`** is a runtime redirect — Vercel's edge
  routes the hostname to the deployment that was aliased.
  Cheap to set up (one API call), no project state, scoped
  to a specific deployment. Ideal for preview / branch /
  one-off bindings.
- **Project domain** is a first-class project setting. Added
  in the dashboard or via the REST API. Automatically tracks
  the production deployment for that project's production
  branch. Required for SSL certificate issuance for custom
  domains; recommended for any URL that should "always point
  at the latest".

For `*.vercel.app` subdomains, Vercel issues the cert
automatically and assigns the `*.vercel.app` wildcard IP —
but the **auto-promote** behavior is what matters here.

## How to tell which kind you have

```bash
# Is it a tracked project domain?
vercel domains ls   # shows project domains

# Is it an alias?
vercel alias ls     # shows aliases (both kinds, depending on version)
```

Tracked project domains also appear under **Project Settings
→ Domains** in the dashboard, with a green check if the cert
+ DNS are healthy.

## Local CLI note

`vercel domains add` only works for domains you own (verifies
DNS), so you cannot use it to claim a free `*.vercel.app`
subdomain. For that, use the dashboard click or the REST API
path shown above.

## Rollback

If you ever need to revert to a previous production build
without waiting for a new deploy:

```bash
# Option A: point all production domains back at a known build
vercel promote <previous-deployment-id>

# Option B: re-alias to an earlier deployment
vercel alias set <previous-deployment-id> cityfix-bd.vercel.app
```

`vercel promote` is the cleaner path because it touches all
production domains at once.
