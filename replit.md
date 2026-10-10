# SecureOps

Cybersecurity incident and vulnerability management with a React dashboard, Express API, and MongoDB Atlas persistence.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the shared Express API server
- `pnpm --filter @workspace/secureops run dev` — run the SecureOps web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Optional secret: `MONGODB_URI` — MongoDB Atlas connection URI; local JSON storage remains available when it is absent or unreachable
- Optional env: `MONGODB_DATABASE` — database name (defaults to `secureops`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: MongoDB Atlas + official MongoDB Node.js driver, with a persistent local JSON fallback
- Validation: Zod (generated from the OpenAPI contract)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/secureops/src/` — React pages, components, and theme
- `artifacts/api-server/src/routes/` — Express API endpoints
- `artifacts/api-server/src/lib/mongo.ts` — MongoDB connection and collection types
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/api-client-react/` and `lib/api-zod/` — generated client hooks and validation schemas

## Architecture decisions

- Atlas is accessed only from the API server; the browser never receives the database URI.
- The API reports the active storage mode at `/api/health` and uses `artifacts/api-server/data/secureops.json` when Atlas is unavailable.
- Local JSON records are private, excluded from Git/deployment bundles, and survive API server restarts.
- Collections are created by MongoDB on first write; there is no startup seeding or fake demo data.
- The generated OpenAPI client and Zod schemas are shared by the frontend and backend.

## Product

Users can review incident and vulnerability summaries, search and filter records, and create, inspect, update, and delete either record type.

## User preferences

- Keep the dashboard dark navy and responsive.
- Report the active backend honestly; do not show fake success messages or seed mock records.

## Gotchas

- Configure `MONGODB_URI` as a Replit Secret to use Atlas; local JSON storage handles data requests when Atlas is unavailable.
- After changing the OpenAPI contract, run API code generation before updating hooks or route validation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
