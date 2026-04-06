'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'whatsapp-inbox-notifications';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useNotification() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<string>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);

    // Always start as false, verify actual subscription
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.getRegistration('/sw.js').then(reg => {
      if (!reg) { setEnabled(false); return; }
      reg.pushManager.getSubscription().then(sub => {
        setEnabled(!!sub);
        localStorage.setItem(STORAGE_KEY, sub ? 'true' : 'false');
      });
    }).catch(() => setEnabled(false));
  }, []);

  const toggle = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    if (enabled) {
      // Optimistic UI update
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, 'false');
      // Background cleanup
      navigator.serviceWorker.getRegistration('/sw.js').then(reg => {
        if (!reg) return;
        reg.pushManager.getSubscription().then(sub => {
          if (!sub) return;
          fetch('/api/push', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          sub.unsubscribe().catch(() => {});
        });
      }).catch(() => {});
      return;
    }

    // Subscribe — need permission first, then optimistic
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;

      // Optimistic UI update
      setEnabled(true);
      localStorage.setItem(STORAGE_KEY, 'true');

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error('[Push] VAPID public key not set');
        setEnabled(false);
        return;
      }

      // Unregister any existing SW to get a clean slate
      const existing = await navigator.serviceWorker.getRegistrations();
      for (const r of existing) {
        const sub = await r.pushManager.getSubscription();
        if (sub) await sub.unsubscribe().catch(() => {});
        await r.unregister();
      }

      // Register fresh SW (no cache)
      const reg = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });

      // Wait for SW to be active
      await new Promise<void>((resolve) => {
        const sw = reg.installing || reg.waiting || reg.active;
        if (reg.active) { resolve(); return; }
        if (sw) {
          sw.addEventListener('statechange', function handler() {
            if (sw.state === 'activated') {
              sw.removeEventListener('statechange', handler);
              resolve();
            }
          });
        }
      });

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      console.log('[Push] New subscription:', JSON.stringify(sub.toJSON()));

      fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      }).catch(() => {});
    } catch (e) {
      console.error('[Push] Subscribe error:', e);
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  }, [enabled]);

  return { enabled, permission, toggle };
}
