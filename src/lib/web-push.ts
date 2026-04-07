import webpush from 'web-push';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

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

export async function sendPushNotification(payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  if (!configured) return;

  const db = getDb();
  const subs = db.select().from(schema.pushSubscriptions).all();
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keysJson),
        } as webpush.PushSubscription;
        await webpush.sendNotification(pushSub, data);
        console.log('[WebPush] Sent to', sub.endpoint.slice(-20));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  for (const endpoint of expiredEndpoints) {
    db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint)).run();
  }
}
