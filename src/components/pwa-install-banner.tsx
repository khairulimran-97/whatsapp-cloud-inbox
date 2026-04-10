'use client';

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const DISMISSED_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if dismissed before
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg bg-[#2ecc71] px-4 py-3 text-white shadow-lg max-w-sm w-[calc(100%-2rem)]">
      <Download className="h-5 w-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Install PPV Support</p>
        <p className="text-xs opacity-90">Add to home screen for quick access</p>
      </div>
      <button
        onClick={handleInstall}
        className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#2ecc71] hover:bg-white/90"
      >
        Install
      </button>
      <button onClick={handleDismiss} className="p-1 hover:opacity-70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
