# Copilot Instructions

## Build & Run Commands

```bash
npm run dev          # Start dev server on port 4000 (Turbopack)
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals + next/typescript)
```

No test framework is configured.

## Architecture

This is a single-page WhatsApp Web-style inbox built with Next.js 15 App Router. The entire app is a client-side SPA (`'use client'`) orchestrated from `src/app/page.tsx`, which manages conversation selection, unread counts, and realtime events.

### Real-time data flow

```
WhatsApp → Kapso Cloud API → POST /api/webhooks/kapso → event-bus → SSE /api/events → Browser
                                                       → web-push → FCM → Notification
Fallback: Browser → adaptive polling → Kapso API → Messages
```

The webhook handler publishes to an in-memory event bus (`src/lib/event-bus.ts`), which fans out to SSE connections and triggers push notifications. Polling adapts its interval based on whether SSE is connected (30s with SSE, 5-10s without).

### Event bus (cross-module sharing in Turbopack)

The event bus uses `Symbol.for()` on `globalThis` to share a single `EventEmitter` across Next.js route modules. This is required because Turbopack dev mode isolates modules — plain `globalThis` keys or module-level singletons don't share state across API routes.

### Kapso SDK

All WhatsApp API calls go through `@kapso/whatsapp-cloud-api`. A singleton client is lazily initialized in `src/lib/whatsapp-client.ts` with a Proxy for backward-compatible property access. The SDK wraps Kapso's REST API (conversations, messages, templates, media, profiles).

### Server-side data

Runtime state is stored as JSON files in `data/` (gitignored):
- `data/unread.json` — Unread counts per phone number (persists across browser sessions)
- `data/push-subscriptions.json` — Web Push subscriptions

These are read/written synchronously with `fs`. There is no database.

### Messages batch endpoint

`/api/messages/batch?ids=a,b,c&mode=initial|poll&refresh=true` fetches messages for multiple conversations in one request. It has an 8-second server-side cache per conversation ID to reduce Kapso API calls.

## Key Conventions

### UI framework

- **shadcn/ui** (new-york style) with Radix primitives — components in `src/components/ui/`
- **Tailwind CSS v4** with CSS custom properties for theming
- `cn()` utility from `src/lib/utils.ts` for conditional class merging (clsx + tailwind-merge)
- Icons from `lucide-react`

### Dark mode

Dark mode uses WhatsApp-specific CSS custom properties (`--wa-*`) defined in `globals.css`. The `useTheme` hook toggles a `dark` class on `<html>`. A blocking inline script in `layout.tsx` prevents flash of wrong theme on load.

### Path aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and components.json).

### API routes

All API routes are in `src/app/api/` using Next.js App Router conventions (route.ts with exported HTTP method handlers). Routes that need real-time streaming (SSE) set `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'`.

### State management

No external state library. The main page component (`src/app/page.tsx`) holds all state via `useState`/`useRef` and passes it down as props. Unread counts are synced bidirectionally: localStorage ↔ server (`data/unread.json`) ↔ SSE broadcast.

### Hooks

Custom hooks in `src/hooks/`:
- `useRealtime` — SSE connection with auto-reconnect (3s retry)
- `useAutoPolling` — Adaptive polling with configurable intervals
- `useNotification` — Web Push subscription management
- `useTheme` — Dark/light toggle with localStorage persistence

### Environment variables

Required: `PHONE_NUMBER_ID`, `KAPSO_API_KEY`, `WABA_ID`. See `.env.example` for the full list. Client-accessible vars use `NEXT_PUBLIC_` prefix.

### MCP configuration

The Kapso documentation MCP server (`https://docs.kapso.ai/mcp`) is configured at `.github/copilot/mcp.json`. Always use this MCP server to look up Kapso API details, SDK methods (`@kapso/whatsapp-cloud-api`), webhook event formats, and integration guides before making assumptions about the API.
