import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[WebPush] VAPID keys not set — push notifications disabled');
    return;
  }
  webpush.setVapidDetails('mailto:noreply@example.com', publicKey, privateKey);
  configured = true;
}

function readSubscriptions(): PushSubscriptionJSON[] {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeSubscriptions(subs: PushSubscriptionJSON[]) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

export async function sendPushNotification(payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  if (!configured) return;

  const subs = readSubscriptions();
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, data);
        console.log('[WebPush] Sent to', sub.endpoint?.slice(-20));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404 or 410 = subscription expired/invalid
        if (statusCode === 404 || statusCode === 410) {
          expired.push(sub.endpoint ?? '');
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    const remaining = subs.filter(s => !expired.includes(s.endpoint ?? ''));
    writeSubscriptions(remaining);
  }
}
