## Cursor Cloud specific instructions

### Project overview

Plinko Go! — a browser-based Plinko casino game. npm workspaces monorepo with three packages:

| Package | Path | Description |
|---------|------|-------------|
| `frontend` | `frontend/` | React 18 + Vite 5 dev server (port 5173) |
| `backend` | `backend/` | Express 4 RGS API server (port 4000) |
| `shared` | `shared/` | Shared TypeScript types |

### Running the app

- `npm run dev` — starts both frontend and backend concurrently.
- Frontend proxies `/api` requests to the backend via Vite config.
- No external services (databases, Redis, Docker) are required; data persists via JSON files in `data/`.

### TypeScript checks

- Backend: `cd backend && npx tsc --noEmit`
- Frontend: `cd frontend && npx tsc -b` (uses project references; `--noEmit` is incompatible with `-b`)

### Notes

- No test framework or lint tooling is configured in this project.
- Node.js v22 is required (see `tsx` and ES2022 target usage).
- `.env.example` exists for reference; all defaults work out of the box without any env vars.
- Session state resets on backend restart (in-memory maps); JSON file persistence is a backup.
