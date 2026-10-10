# SecureOps

SecureOps is a cybersecurity incident and vulnerability management platform. Security teams can track incidents from discovery through resolution, manage vulnerabilities by severity and affected asset, and review live dashboard totals.

## Features

- Dashboard summary and severity charts backed by MongoDB Atlas when available, or persistent local JSON storage during an outage.
- Incident create, view, update, and delete workflows.
- Vulnerability create, view, update, and delete workflows.
- Search and severity/status filters for both record types.
- Input validation in the browser and API, with clear server error messages.
- Responsive dark dashboard layout.
- No demo records or simulated success responses: successful responses follow real writes to the active storage backend.

  ##  AI-Assisted Development

**Tools used:** Replit Agent and ChatGPT for development guidance, troubleshooting, and documentation. Kiro was considered during the development process, but Replit was used as the primary online development environment.

### AI-assisted tasks

1. **Project structure:** Assisted with organizing the React frontend, Express API server, and shared API definitions.
2. **Incident management:** Assisted with implementing API workflows for creating, viewing, updating, and deleting security incidents.
3. **Vulnerability management:** Assisted with implementing vulnerability tracking, severity information, status updates, and affected-asset details.
4. **Validation and error handling:** Assisted with reviewing API request validation and error responses.
5. **Troubleshooting and documentation:** Assisted with investigating development and database connectivity issues and preparing the project README.

AI-generated suggestions were reviewed during development. Database connectivity and deployment should be verified independently before the application is used in production.

## Installation and setup

### Requirements

- Node.js 24 or a compatible current Node.js release.
- pnpm 10.
- A MongoDB Atlas cluster and database user with read/write access.

### Configure MongoDB Atlas

1. Create a database user in Atlas and allow the app's outbound network access in the cluster's Network Access settings.
2. Add the Atlas connection URI to Replit Secrets under `MONGODB_URI`. Never commit the URI or paste it into source files. The server uses the `secureops` database by default; set the optional `MONGODB_DATABASE` environment variable to use another database name.
3. For a local run outside Replit, provide `MONGODB_URI` through your local secret/environment manager. Do not add a populated `.env` file to version control.

## Security note

This first version does not include sign-in or role-based access control. Do not use it for sensitive production incident data or expose it to untrusted users until authentication, authorization, and an audit trail are added.

### Install and run

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/secureops run dev
```

Run the API server and web app in separate terminals when starting them manually. In Replit, start the existing **API Server** and **SecureOps** workflows instead. Open the SecureOps web preview; API requests are routed through `/api`.

## Architecture

```text
React + Vite frontend (artifacts/secureops)
        │ generated API hooks, /api/*
        ▼
Express 5 API (artifacts/api-server)
        ├── MongoDB Node.js driver ── MongoDB Atlas (secureops database)
        └── Persistent fallback ───── artifacts/api-server/data/secureops.json
```

- **Frontend:** React, TypeScript, Vite, Wouter, TanStack Query, and Recharts.
- **API:** Node.js and Express with request/response validation using generated Zod schemas.
- **Contract:** `lib/api-spec/openapi.yaml` is the API source of truth. Generated Zod schemas and React Query hooks live in `lib/api-zod` and `lib/api-client-react`.
- **Persistence:** MongoDB Atlas is selected when its connection and health check succeed. If Atlas is unavailable, the API switches to the project-local JSON file and continues serving real saved records. The fallback file is mirrored while MongoDB is active; local fallback records are merged into MongoDB on a later successful server startup.
- **Health:** `GET /api/health` and `GET /api/healthz` report `storageMode`, MongoDB connectivity, fallback status, and a sanitized message. A local fallback returns `status: "degraded"` with HTTP 200 because persistent storage is available; HTTP 503 is reserved for when neither backend can serve data.
- **Local data:** `artifacts/api-server/data/secureops.json` is created at runtime with private file permissions and excluded from Git and deployment bundles. Restarting the API process does not clear it.

## Screenshots
- Dashboard Overview
  
> **Dashboard screenshot placeholder:** Add a capture of the SecureOps overview here.
<img width="1098" height="592" alt="Screenshot 2026-10-10 170705" src="https://github.com/user-attachments/assets/076f985f-a503-495e-82fa-68fbd358a68c" />
<img width="1114" height="577" alt="Screenshot 2026-10-10 170717" src="https://github.com/user-attachments/assets/90d30a6b-32e2-46b5-92a3-334f667fba11" />

- Incident Management

> **Incident-management screenshot placeholder:** Add a capture of the incident list and detail workflow here.
> <img width="1092" height="566" alt="Screenshot 2026-10-10 170737" src="https://github.com/user-attachments/assets/4b37356b-8718-4d25-bce2-c88199cd8994" />

- Vulnerability Management
  
> **Vulnerability-management screenshot placeholder:** Add a capture of the vulnerability list and detail workflow here.
> <img width="1101" height="557" alt="Screenshot 2026-10-10 170750" src="https://github.com/user-attachments/assets/7d3ff58e-9ff4-4db9-9329-8ca029b01945" />

## Verification Results

- The SecureOps dashboard, incident list, and vulnerability list load in the Replit preview.
- The API health endpoint responds successfully.
- The health check currently reports `storageMode: "local-json"` and `mongodbConnected: false`.
- MongoDB Atlas connection attempts currently fail with a TLS handshake error. The application uses persistent local JSON fallback storage while Atlas is unavailable.
- Browser-refresh persistence was observed for the displayed records. MongoDB Atlas persistence remains unverified.



## Testing

Run the workspace TypeScript checks:

```bash
pnpm run typecheck
```

With both workflows running, verify the active storage mode and dashboard through the Replit proxy:

```bash
curl -i http://localhost:80/api/health
curl -i http://localhost:80/api/dashboard/summary

# Create an incident. Copy its id from the response for the remaining checks.
curl -i -X POST http://localhost:80/api/incidents \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test incident","description":"Temporary API workflow verification record.","severity":"Low","status":"Open"}'

# Search/filter, then read and update by id.
curl -i 'http://localhost:80/api/incidents?search=Test&severity=Low&status=Open'
curl -i http://localhost:80/api/incidents/INCIDENT_ID
curl -i -X PATCH http://localhost:80/api/incidents/INCIDENT_ID \
  -H 'Content-Type: application/json' -d '{"status":"Investigating"}'

# Create, read, update, and delete a vulnerability the same way.
curl -i -X POST http://localhost:80/api/vulnerabilities \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test vulnerability","description":"Temporary workflow verification record.","affectedAsset":"test-host","severity":"Medium","status":"Open"}'
curl -i 'http://localhost:80/api/vulnerabilities?search=test-host&severity=Medium'
curl -i http://localhost:80/api/vulnerabilities/VULNERABILITY_ID
curl -i -X PATCH http://localhost:80/api/vulnerabilities/VULNERABILITY_ID \
  -H 'Content-Type: application/json' -d '{"status":"Mitigated"}'
curl -i -X DELETE http://localhost:80/api/vulnerabilities/VULNERABILITY_ID

# Invalid values should return HTTP 400 with a JSON error.
curl -i -X POST http://localhost:80/api/vulnerabilities \
  -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"short","affectedAsset":"","severity":"Urgent"}'
```

Delete the temporary incident with `curl -i -X DELETE http://localhost:80/api/incidents/INCIDENT_ID`. To verify persistence, create a record, restart the API Server workflow, then read the record by id again. The JSON fallback is a development/demo store; avoid running multiple API processes against the same file at once.

## Repository map

- `artifacts/secureops/src/` — React pages, components, styling, and API hook usage.
- `artifacts/api-server/src/routes/` — Dashboard, incident, and vulnerability endpoints.
- `artifacts/api-server/src/lib/mongo.ts` — MongoDB connection and collection types.
- `lib/api-spec/openapi.yaml` — API contract.
- `lib/api-zod/` and `lib/api-client-react/` — generated API validation and client code.

 
