# Production backend contract

The production API is built with `npm run build:server` and started with
`npm run start:server`. It is independent of Vite. Deploy the built frontend
and proxy `/api/*` to this server on the same HTTPS origin; no cross-origin API
mode is enabled.

Required production configuration:

- `NODE_ENV=production`
- `PORT` (defaults to `8080`) and optional `HOST`
- `PUBLIC_ORIGIN` as an exact canonical HTTPS origin
- `SESSION_COOKIE_SECURE=true`
- `TRUST_PROXY=1`; the application must only be reachable through the trusted
  TLS-terminating reverse proxy
- the existing valid Production Plaid configuration, with `PLAID_PRODUCTS=auth`
- `OPERATIONAL_STORE_MODULE`, an absolute or working-directory-relative path
  to a server-side JavaScript module

The operational-store module must export `createOperationalStores({ environment })`.
It must return the complete `OperationalStores` contract from
`operationalStore.ts` and declare `kind: "production-durable"` with every
capability enabled. The adapter is responsible for durable transactions,
owner and environment scoping, compare-and-swap cursor advancement, expiry,
atomic one-time consumption, and encrypted provider secrets. A conventional
relational database is the intended implementation, but no cloud vendor or
database driver is coupled to Stage 2A.

Production startup refuses memory stores, development JSON stores, incomplete
adapters, insecure cookie/proxy configuration, invalid Plaid Production
configuration, and any configuration that would enable Production
Transactions. The development JSON adapter is intentionally not a Production
database.
