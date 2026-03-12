#!/usr/bin/env bash
set -euo pipefail

echo "==> Building backend (for Render)"
npm run build --workspace=backend

echo "==> Building frontend (for Cloudflare Pages)"
npm run build --workspace=frontend

echo "==> Triggering Render deploy (if RENDER_DEPLOY_HOOK_URL is set)"
if [[ -n "${RENDER_DEPLOY_HOOK_URL:-}" ]]; then
  curl -fsSL -X POST "$RENDER_DEPLOY_HOOK_URL" >/dev/null && echo "Render deploy hook triggered."
else
  echo "RENDER_DEPLOY_HOOK_URL not set. Skipping Render auto-deploy trigger."
fi

echo "==> Triggering Cloudflare Pages deploy (if CLOUDFLARE_PAGES_HOOK_URL is set)"
if [[ -n "${CLOUDFLARE_PAGES_HOOK_URL:-}" ]]; then
  curl -fsSL -X POST "$CLOUDFLARE_PAGES_HOOK_URL" >/dev/null && echo "Cloudflare Pages deploy hook triggered."
else
  echo "CLOUDFLARE_PAGES_HOOK_URL not set. Skipping Cloudflare Pages auto-deploy trigger."
fi

echo "==> Done. Remote platforms will build & deploy using their latest configured settings."

