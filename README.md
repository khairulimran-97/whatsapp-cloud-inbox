# WhatsApp Cloud Inbox

A WhatsApp Web-style inbox built with Next.js for the WhatsApp Cloud API via [Kapso](https://app.kapso.ai). Send messages, templates, and interactive buttons with a familiar UI — with real-time updates via webhooks.

![WhatsApp Cloud Inbox](https://cdn.jsdelivr.net/gh/gokapso/whatsapp-cloud-inbox@main/assets/kapso-whatsapp-inbox.png)

## Features

- **Real-time messaging** — Webhook + SSE for instant updates (~1-2s), with polling fallback (30s)
- **Web Push notifications** — Background push via FCM + service worker, even with browser closed
- **Unread sync** — Server-side unread counts synced across browsers via SSE
- **Password protection** — Simple password gate with localStorage persistence
- **PWA installable** — Add to home screen with app manifest and service worker
- **Template messages** — Full support for WhatsApp templates with parameters (header, body, buttons)
- **Interactive messages** — Send button messages, list messages, and CTA URL messages
- **Media support** — Send and receive images, videos, documents, and audio with lightbox viewer
- **24-hour window enforcement** — Automatically restricts messaging outside WhatsApp's window
- **Conversation management** — Close/reopen conversations with status indicators
- **Mark as read/unread** — Mark conversations via WhatsApp Cloud API
- **Message reactions** — React to messages with emojis
- **Message search** — Search messages within conversations
- **Dark mode** — Full dark theme matching WhatsApp Web with toggle
- **Mobile responsive** — Slide panel navigation for mobile screens
- **Business profile** — Shows WhatsApp business profile picture, name, and phone number
- **Failed message indicators** — Visual feedback for delivery failures
- **BCL customer sidebar** — Customer info, transactions, and protected content from BCL.my API
- **CS reply templates** — Admin-managed quick reply templates with categories
- **SQLite database** — Persistent storage with atomic operations (replaces JSON files)
- **Docker support** — Multi-stage Dockerfile with standalone output (~238MB image)

## Architecture

```
WhatsApp → Kapso Cloud → Webhook POST → SSE Stream → Browser (~1-2s)
                                      → Web Push → FCM → Notification (background)
                                      → Unread sync → SQLite (atomic increment)

Fallback: Browser → Adaptive Polling → Kapso API → Messages
          (10s/5s without webhook, 30s with webhook)
```

### Key Components

| File | Description |
|---|---|
| `src/app/page.tsx` | Main orchestrator — state, unread counts, realtime events, auth |
| `src/components/message-view.tsx` | Chat view with message bubbles, input, media, template picker |
| `src/components/conversation-list.tsx` | Sidebar with conversation list, settings, unread badges |
| `src/components/customer-sidebar.tsx` | BCL customer info panel (inline on desktop, slideover on mobile) |
| `src/components/login-screen.tsx` | Password login screen with WhatsApp-style UI |
| `src/app/api/webhooks/kapso/route.ts` | Webhook receiver + unread tracking + push notifications |
| `src/app/api/events/route.ts` | SSE streaming endpoint for real-time browser updates |
| `src/app/api/unread/route.ts` | Server-side unread storage with SSE broadcast |
| `src/app/api/push/route.ts` | Push subscription management (subscribe/unsubscribe) |
| `src/app/api/settings/route.ts` | Admin settings management (BCL API key) |
| `src/app/api/reply-templates/route.ts` | CS reply template CRUD |
| `src/app/api/customers/route.ts` | BCL.my customer lookup with transaction history |
| `src/app/api/messages/batch/route.ts` | Batch messages endpoint with server-side caching |
| `src/lib/db/` | SQLite database (Drizzle ORM) — schema + singleton connection |
| `src/lib/event-bus.ts` | In-memory pub/sub for webhook → SSE communication |
| `src/lib/web-push.ts` | Server-side push notification sender via web-push |

## Setup

### 1. Get Kapso Credentials

1. Create account at [app.kapso.ai](https://app.kapso.ai)
2. Connect a WhatsApp number
3. Get your credentials:
   - `PHONE_NUMBER_ID` — Your WhatsApp phone number ID
   - `KAPSO_API_KEY` — API key for authentication
   - `WABA_ID` — WhatsApp Business Account ID

### 2. Clone and Install

```bash
git clone https://github.com/gokapso/whatsapp-cloud-inbox.git
cd whatsapp-cloud-inbox
npm install
```

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
PHONE_NUMBER_ID=your_phone_number_id
KAPSO_API_KEY=your_kapso_api_key
WABA_ID=your_business_account_id

# Optional: custom API endpoint (defaults to https://api.kapso.ai/meta/whatsapp)
WHATSAPP_API_URL=

# Optional: webhook secret for signature verification (from Kapso dashboard)
KAPSO_WEBHOOK_SECRET=your_webhook_secret

# Web Push (generate with: npx web-push generate-vapid-keys --json)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# Password protection (default: Webimpian1111)
APP_PASSWORD=your_password

# App URL for PWA
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

| Variable | Required | Description |
|---|---|---|
| `PHONE_NUMBER_ID` | ✅ | WhatsApp phone number ID from Kapso |
| `KAPSO_API_KEY` | ✅ | API key for Kapso API authentication |
| `WABA_ID` | ✅ | WhatsApp Business Account ID |
| `WHATSAPP_API_URL` | ❌ | Custom API endpoint (default: `https://api.kapso.ai/meta/whatsapp`) |
| `KAPSO_WEBHOOK_SECRET` | ❌ | Webhook signature secret for HMAC-SHA256 verification |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ❌ | VAPID public key for Web Push notifications |
| `VAPID_PRIVATE_KEY` | ❌ | VAPID private key for Web Push notifications |
| `APP_PASSWORD` | ❌ | Password to access the app (default: `Webimpian1111`) |
| `NEXT_PUBLIC_APP_URL` | ❌ | Public URL of the app |

### 4. Generate VAPID Keys (for Web Push)

```bash
npx web-push generate-vapid-keys --json
```

Copy the keys to your `.env` file.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000)

## Webhook Setup (Real-time Updates)

Webhooks enable instant message delivery (~1-2s) instead of relying on polling (30s). Without webhooks, the app still works but with slower updates.

### 1. Expose Your Local Server

For local development, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# Quick tunnel (random URL, good for testing)
cloudflared tunnel --url http://localhost:4000

# Or named tunnel with custom domain
cloudflared tunnel create whatsapp-inbox
cloudflared tunnel route dns whatsapp-inbox webhook.yourdomain.com
cloudflared tunnel run whatsapp-inbox
```

### 2. Configure in Kapso Dashboard

1. Go to **Kapso Dashboard → Webhooks**
2. Add webhook:
   - **URL:** `https://your-domain.com/api/webhooks/kapso`
   - **Type:** Kapso (events)
   - **Secret:** Copy to your `.env` as `KAPSO_WEBHOOK_SECRET`
3. Enable events:
   - ✅ Message received
   - ✅ Message sent
   - ✅ Message delivered
   - ✅ Message read
   - ✅ Message failed
   - ✅ Conversation started
   - ✅ Conversation ended
   - ✅ Conversation inactive
4. **Debouncing:** Disable for fastest updates, or set 5s window for batching

### 3. Verify

```bash
# Health check
curl https://your-domain.com/api/webhooks/kapso
# → {"status":"ok","message":"Kapso webhook endpoint"}
```

## Key Features

### Password Protection

Simple password gate — enter once per browser, stored in localStorage:
- Set `APP_PASSWORD` in `.env` (default: `Webimpian1111`)
- WhatsApp-themed dark login screen
- No re-entry needed on same browser

### Web Push Notifications

Receive notifications even when the browser tab is closed:
- 🔔 Toggle via bell icon in the header
- Confirmation modal for enable/disable
- Push delivered via FCM (Firebase Cloud Messaging)
- Service worker handles background push events
- Auto-cleanup of expired subscriptions

### PWA (Progressive Web App)

Install as a standalone app:
- Add to home screen / desktop
- Standalone display (no browser chrome)
- Install banner on first visit
- Works on desktop and mobile

### Real-time Updates

Two-layer update system with adaptive polling:

- **Webhook + SSE (primary):** Kapso sends webhook → server publishes to SSE → browser refreshes instantly (~1-2s)
- **Polling (adaptive fallback):** Automatically adjusts based on SSE connection status

| | With Webhook (SSE connected) | Without Webhook (SSE disconnected) |
|---|---|---|
| **Conversations** | 30s (backup) | 10s |
| **Messages** | 30s (backup) | 5s |

### Unread Counts

- Server-side storage in SQLite with atomic increments (no race conditions)
- Real-time sync across browsers via SSE `unread_update` events
- Webhook increments unread even with no browser open
- Mark-as-read via WhatsApp Cloud API on conversation open

### Notification Sound + Unread Badges

- 🔔 WhatsApp-style notification sound on every inbound message
- 🔴 Numeric unread count badge on conversation sidebar
- Sound plays in-browser when tab is open; push notification when closed (no duplicate)
- Browser audio auto-unlocks on first user interaction

### Template Messages

Send WhatsApp-approved templates with dynamic parameters:
- **Header + Body + Button parameters** — Full template support
- **Named and positional parameters** — Automatic detection
- **Two-step flow** — Select template → Fill parameters → Send

### Interactive Messages

Create button messages without templates:
- **Header (optional)** + **Body (required)** + **Buttons (1-3)**
- Each button gets a unique ID and title (max 20 chars)

### 24-Hour Window

Automatically enforces WhatsApp's messaging policy:
- **Within 24h** — Send regular messages freely
- **Outside 24h** — Template-only mode with clear messaging

### Message Types

- ✅ Text messages
- ✅ Images, videos, audio, documents (with lightbox viewer)
- ✅ Template messages (with all parameter types)
- ✅ Interactive button messages
- ✅ Reactions
- ✅ Read receipts and delivery status

## Tech Stack

- **Framework:** Next.js 15 (Turbopack)
- **UI:** Tailwind CSS v4 + shadcn/ui
- **Database:** SQLite 3.51 (better-sqlite3 + Drizzle ORM)
- **API:** Kapso WhatsApp Cloud API (`@kapso/whatsapp-cloud-api`)
- **Real-time:** Webhook + Server-Sent Events (SSE)
- **Push:** web-push + FCM + Service Worker
- **Language:** TypeScript
- **Container:** Docker (multi-stage, standalone output)

## Data Storage

All persistent data is stored in SQLite at `data/app.db` (gitignored, volume-mounted in Docker):

| Table | Description |
|---|---|
| `settings` | Key-value store (BCL API key, etc.) |
| `reply_templates` | CS quick reply templates with categories |
| `unread_counts` | Unread message counts per phone (atomic increment) |
| `push_subscriptions` | Web Push notification subscriptions |

SQLite runs in WAL mode for concurrent read/write performance. The database is auto-created on first run with no migration step needed.

## Docker

### Build and Run

```bash
docker compose up -d              # Start
docker compose down               # Stop
docker compose up -d --build      # Rebuild after code changes
```

### Manual Docker

```bash
docker build -t whatsapp-inbox .
docker run -d -p 4000:4000 --env-file .env -v ./data:/app/data whatsapp-inbox
```

The `data/` directory is volume-mounted to persist the SQLite database across container restarts.

## Contributing

Issues and PRs welcome. Keep it simple.

## License

MIT
