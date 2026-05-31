# Standup Whisperer

AI-powered tool that converts raw, messy daily notes into clean professional standups (Yesterday / Today / Blockers) with real-time streaming output.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `ANTHROPIC_API_KEY` — Anthropic API key for Claude

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- AI: Anthropic Claude (`claude-haiku-4-5`) via `@workspace/integrations-anthropic-ai`
- Frontend: React + Vite, TailwindCSS, shadcn/ui
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `artifacts/standup-whisperer/` — React + Vite frontend (served at `/`)
- `artifacts/api-server/src/routes/standup/` — standup processing route + 4-layer prompt system
- `lib/integrations-anthropic-ai/` — Anthropic SDK wrapper (uses `ANTHROPIC_API_KEY`)

## Architecture decisions

- Standup conversion is stateless — no database, no conversation history. Each request is independent.
- The `/api/standup/process` endpoint returns an SSE stream. Client uses raw `fetch + ReadableStream`, not the generated React Query hook (Orval can't generate usable SSE hooks).
- The Anthropic client is initialized with `ANTHROPIC_API_KEY` directly (not the Replit AI Integrations proxy).
- The 4-layer prompt system (identity, semantic rules, format contract, edge case handlers) lives entirely in the backend route handler.

## Product

- Paste raw standup notes → get formatted Yesterday/Today/Blockers standup
- Supports Plain Text, Slack, and Markdown output formats
- Real-time streaming output as Claude generates the standup
- Abort mid-generation, copy to clipboard

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The `SquareSquare` icon doesn't exist in lucide-react — use `AlignLeft` or similar instead.
- After changing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` before building.
- The Anthropic client (`lib/integrations-anthropic-ai/src/client.ts`) was modified to use `ANTHROPIC_API_KEY` directly instead of the Replit AI Integrations proxy vars.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
