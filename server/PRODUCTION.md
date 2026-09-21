# Production backend contract

The production API is built with `npm run build:server` and started with
`npm run start:server`. It is independent of Vite. Deploy the built frontend
and proxy `/api/*` to this server on the same HTTPS origin; no cross-origin API
mode is enabled. Route `/oauth/plaid` to the built frontend shell on that same
origin. The standalone server also serves `dist/index.html` for that exact
callback path, so the callback does not depend on Vite middleware.

Required production configuration:

- `NODE_ENV=production`
- `PORT` (defaults to `8080`) and optional `HOST`
- `PUBLIC_ORIGIN` as an exact canonical HTTPS origin
- `SESSION_COOKIE_SECURE=true`
- `TRUST_PROXY=1`; the application must only be reachable through the trusted
  TLS-terminating reverse proxy
- the existing valid Production Plaid configuration, with `PLAID_PRODUCTS=auth`
- `PLAID_REDIRECT_URI` as the exact `${PUBLIC_ORIGIN}/oauth/plaid` HTTPS URL,
  with no credentials, query, or fragment
- `OPERATIONAL_STORE_MODULE`, an absolute or working-directory-relative path
  to `dist-server/postgresOperationalStore.mjs`
- `DATABASE_URL`, a PostgreSQL connection string available only to the backend
- `ACCOUNT_BACKUP_MODE=disabled`; Production has no JSON account-backup fallback

The operational-store module must export `createOperationalStores({ environment })`.
It must return the complete `OperationalStores` contract from
`operationalStore.ts`, declare `kind: "production-durable"` and
`backend: "postgresql"`, and enable every capability. The adapter is responsible for durable transactions,
owner and environment scoping, compare-and-swap cursor advancement, expiry,
atomic one-time OAuth consumption, lookup by Link session, callback binding,
and encrypted provider secrets. OAuth recovery records persist the temporary
Link token but never an access token, public token, Item ID, provider secret,
credential, or session cookie. A conventional
PostgreSQL is the required Production implementation.

Run `npm run db:migrate` explicitly before starting a release. Migrations are
ordered, checksummed, transactional, and idempotent; startup refuses missing,
changed, or unknown migration history. `npm run build:server` emits the API,
PostgreSQL adapter, migration runner, user bootstrap CLI, and SQL migration
files in `dist-server/`.

Create the initial Production user only after migrations are current:

`npm run user:bootstrap:production -- --email owner@example.com --name "Owner"`

The CLI reads the password from a hidden terminal prompt (or stdin), never from
an argument, and creates no session. Public registration and legacy enrollment
are disabled in Production. eToro and FX auxiliary routes require an
authenticated server session. `/api/health` exposes only `ready` or
`unavailable` and verifies PostgreSQL connectivity plus migration currency.

Production startup refuses memory stores, development JSON stores, incomplete
adapters, insecure cookie/proxy configuration, invalid Plaid Production
configuration, and any configuration that would enable Production
Transactions. The development JSON adapter is intentionally not a Production
database.
