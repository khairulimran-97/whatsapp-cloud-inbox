# PPV Support — WhatsApp Cloud Inbox

A WhatsApp Web-style customer support inbox built with Next.js 15 for the WhatsApp Cloud API via [Kapso](https://app.kapso.ai). Real-time messaging, Web Push notifications, SQLite caching, and a PWA-installable dark-mode UI.

![WhatsApp Cloud Inbox](https://cdn.jsdelivr.net/gh/gokapso/whatsapp-cloud-inbox@main/assets/kapso-whatsapp-inbox.png)

## Features

### Messaging
- **Real-time messaging** — Webhook + SSE for instant updates (~1-2s), adaptive polling fallback
- **Template messages** — Full support with header, body, and button parameters
- **Interactive messages** — Button messages, list messages, and CTA URL messages
- **Media support** — Send/receive images, videos, documents, audio with lightbox viewer
- **Message reactions** — React to messages with emojis
- **Read receipts** — Delivery status indicators (sent, delivered, read, failed)
- **24-hour window** — Auto-enforces WhatsApp messaging policy (template-only outside window)

### Conversations
- **Server-side search** — Search across conversations and messages with highlighted results
- **Conversation management** — Close/reopen conversations with status indicators
- **Unread sync** — Server-side atomic counts synced across browsers via SSE
- **Mark as read/unread** — Toggle via WhatsApp Cloud API
- **Message pagination** — Load older messages with scroll-to-load

### Notifications
- **Web Push** — Background push via FCM + service worker, even with browser closed
- **Notification sound** — WhatsApp-style sound on inbound messages
- **Unread badges** — Numeric count badges on conversation sidebar

### Customer Support
- **CS reply templates** — Admin-managed quick reply templates with categories
- **BCL customer sidebar** — Customer info, transactions, and protected content from BCL.my API
- **Kapso workflow integration** — Trigger and monitor Kapso platform workflows per conversation

### Admin
- **Database viewer** — Built-in `/admin/db` page with token-based access (TablePlus-inspired UI)
- **Webhook logs** — Full webhook event logging with payload inspection
- **Settings panel** — In-app configuration for BCL API, templates, data management

### App
- **PWA installable** — Add to home screen with custom icon and standalone display
- **Dark mode** — Full dark theme with WhatsApp-style CSS custom properties
- **Mobile responsive** — Slide panel navigation for mobile screens
- **Password protection** — Simple password gate with localStorage persistence
- **Docker support** — Multi-stage Dockerfile with standalone output (~238MB image)

## Architecture

```
WhatsApp → Kapso Cloud → Webhook POST → SSE Stream → Browser (~1-2s)
                                      → Web Push → FCM → Notification (background)
                                      → SQLite cache (conversations, messages, contacts)
                                      → Unread sync (atomic increment)

Fallback: Browser → Adaptive Polling → Kapso API → Messages
          (10s/5s without webhook, 30s with webhook)
```

### Key Components

| File | Description |
|---|---|
| `src/app/page.tsx` | Main orchestrator — state, unread counts, realtime events, auth |
| `src/components/message-view.tsx` | Chat view — bubbles, input, media, templates, search highlight |
| `src/components/conversation-list.tsx` | Sidebar — conversations, settings, search, unread badges |
| `src/components/customer-sidebar.tsx` | BCL customer panel (inline desktop, slideover mobile) |
| `src/components/login-screen.tsx` | Password login with PPV branding |
| `src/app/api/webhooks/kapso/route.ts` | Webhook receiver + cache sync + unread + push |
| `src/app/api/events/route.ts` | SSE streaming for real-time browser updates |
| `src/app/api/messages/batch/route.ts` | Batch messages with 8s server-side cache |
| `src/app/api/conversations/route.ts` | Conversations with server-side search (SQLite + API) |
| `src/app/api/admin/db/route.ts` | Token-protected database viewer API |
| `src/app/admin/db/page.tsx` | Database viewer UI (TablePlus-inspired) |
| `src/lib/db/` | SQLite database — Drizzle ORM schema + singleton connection |
| `src/lib/event-bus.ts` | In-memory pub/sub (Symbol.for pattern for Turbopack) |
| `src/lib/kapso-platform.ts` | Kapso Platform API client (workflows, executions) |

### Hooks

| Hook | Description |
|---|---|
| `useRealtime` | SSE connection with auto-reconnect (3s retry) |
| `useAutoPolling` | Adaptive polling — adjusts interval based on SSE status |
| `useNotification` | Web Push subscription management |
| `useTheme` | Dark/light toggle with localStorage persistence |

## Setup

### 1. Get Kapso Credentials

1. Create account at [app.kapso.ai](https://app.kapso.ai)
2. Connect a WhatsApp number
3. Get your credentials from the dashboard

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

| Variable | Required | Description |
|---|---|---|
| `PHONE_NUMBER_ID` | ✅ | WhatsApp phone number ID from Kapso |
| `KAPSO_API_KEY` | ✅ | API key for Kapso API authentication |
| `WABA_ID` | ✅ | WhatsApp Business Account ID |
| `WHATSAPP_API_URL` | ❌ | Custom API endpoint (default: `https://api.kapso.ai/meta/whatsapp`) |
| `KAPSO_WEBHOOK_SECRET` | ❌ | Webhook secret for HMAC-SHA256 signature verification |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ❌ | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | ❌ | VAPID private key for Web Push |
| `APP_PASSWORD` | ❌ | Password to access the app (default: `Webimpian1111`) |
| `NEXT_PUBLIC_APP_URL` | ❌ | Public URL of the app (for PWA and push) |
| `BCL_API_KEY` | ❌ | BCL.my API key for customer lookup |

### 4. Generate VAPID Keys (for Web Push)

```bash
npx web-push generate-vapid-keys --json
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000)

## Docker

### Quick Start

```bash
docker compose up -d              # Start containers
docker compose down               # Stop containers
docker compose up -d --build      # Rebuild after code changes
docker compose logs -f             # View live logs
```

### Image Details

- **Base:** `node:22-alpine`
- **Build:** Multi-stage (deps → build → production)
- **Output:** Next.js standalone mode (~238MB final image)
- **Port:** `4000`
- **User:** Non-root (`nextjs:nodejs`, UID 1001)

### Manual Docker Build

```bash
# Build image
docker build -t whatsapp-inbox .

# Run container
docker run -d \
  --name whatsapp-inbox \
  -p 4000:4000 \
  --env-file .env \
  -v ./data:/app/data \
  --restart unless-stopped \
  whatsapp-inbox
```

### Production Deployment

#### First-time Setup

```bash
# 1. Clone repository on your server
git clone <your-repo-url>
cd whatsapp-cloud-inbox

# 2. Configure environment
cp .env.example .env
nano .env                          # Fill in your credentials

# 3. Build and start
docker compose up -d --build

# 4. Verify it's running
docker compose ps                  # Check container status
curl http://localhost:4000         # Should return HTML
```

#### Updating to Latest Version

```bash
cd whatsapp-cloud-inbox

# 1. Pull latest code
git pull

# 2. Rebuild and restart (zero-downtime with --build)
docker compose up -d --build

# 3. Verify
docker compose ps
docker compose logs --tail=20      # Check for startup errors
```

#### Rollback to Previous Version

```bash
# If something breaks after update
git log --oneline -5               # Find the previous commit
git checkout <commit-hash>         # Revert to that commit
docker compose up -d --build       # Rebuild with old code
```

### Data Persistence

The `data/` directory is volume-mounted to persist the SQLite database (`data/app.db`) across container restarts and rebuilds.

```
data/
└── app.db          # SQLite database (auto-created on first run)
```

> **⚠️ Backup:** The database is a single file. Back it up with:
> ```bash
> cp data/app.db data/app.db.backup
> ```

### Useful Commands

```bash
# View container logs
docker compose logs -f --tail=100

# Restart without rebuilding
docker compose restart

# Check resource usage
docker stats whatsapp-cloud-inbox-app-1

# Enter container shell (for debugging)
docker compose exec app sh

# Check database size
ls -lh data/app.db

# Full rebuild from scratch (clears build cache)
docker compose build --no-cache && docker compose up -d
```

## Webhook Setup

Webhooks enable instant message delivery (~1-2s). Without webhooks, the app still works via polling.

### 1. Expose Your Server

For local development, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
cloudflared tunnel --url http://localhost:4000
```

### 2. Configure in Kapso Dashboard

1. Go to **Kapso Dashboard → Webhooks**
2. Add webhook URL: `https://your-domain.com/api/webhooks/kapso`
3. Copy the secret to `.env` as `KAPSO_WEBHOOK_SECRET`
4. Enable all message and conversation events

### 3. Verify

```bash
curl https://your-domain.com/api/webhooks/kapso
# → {"status":"ok","message":"Kapso webhook endpoint"}
```

## Database

All data is stored in SQLite at `data/app.db` (WAL mode, auto-created on first run):

| Table | Description |
|---|---|
| `conversations` | Cached conversations with last message info |
| `messages` | Cached messages with media, status, metadata |
| `contacts` | Contact names and phone numbers |
| `unread_counts` | Unread counts per phone (atomic increment) |
| `settings` | Key-value config store |
| `reply_templates` | CS quick reply templates with categories |
| `push_subscriptions` | Web Push subscription endpoints |
| `webhook_logs` | Webhook event history with full payloads |

### Database Viewer

Access the built-in database viewer from **Settings → Data → Open Database Viewer**. Generates a 4-hour access token. Features: table browsing, search, sort, row detail with copy.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **UI:** Tailwind CSS v4 + shadcn/ui (new-york style)
- **Database:** SQLite (better-sqlite3 + Drizzle ORM, WAL mode)
- **API:** Kapso WhatsApp Cloud API (`@kapso/whatsapp-cloud-api`)
- **Real-time:** Webhook → EventEmitter → Server-Sent Events (SSE)
- **Push:** web-push + FCM + Service Worker
- **Language:** TypeScript
- **Container:** Docker (multi-stage, standalone output, ~238MB)
- **Icons:** Lucide React

## License

MIT
