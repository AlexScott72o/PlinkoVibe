# AGENTS.md

## Cursor Cloud specific instructions

This is a browser-based Plinko casino game ("Plinko Go!") using an npm workspaces monorepo with three packages: `frontend` (Vite + React), `backend` (Express), and `shared` (TypeScript types).

### Running the app

- `npm run dev` from the repo root starts both frontend (port 5173) and backend (port 4000) concurrently via `concurrently`.
- The Vite dev server proxies `/api` requests to `http://localhost:4000`, so no CORS or URL config is needed in dev.
- No database or external service is required; the backend persists data to flat JSON files in `data/`.

### Build

- `npm run build` builds the frontend (TypeScript check + Vite production build).
- `npm run build --workspace=backend` compiles the backend TypeScript.

### Testing

- There is no automated test framework configured in this codebase. Manual testing is done by running the dev servers and interacting with the UI or calling the REST API directly.
- API endpoints for manual testing: `POST /api/session`, `GET /api/config`, `POST /api/plinko/bet`, `GET /api/balance`, `GET /api/history`. See `README.md` for details.

### Gotchas

- The `.env` file must exist (copy from `.env.example`) but all values have sensible defaults; no secrets are required at runtime.
- `GEMINI_API_KEY` is only used by the optional asset generation script (`scripts/generate-assets.js`), not at runtime.
