'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a1a] border border-[#333] px-4 py-3 text-white shadow-2xl max-w-sm w-[calc(100%-2rem)]">
      <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Install PPV Support</p>
        <p className="text-xs text-[#8e8e93]">Add to home screen for quick access</p>
      </div>
      <button
        onClick={handleInstall}
        className="rounded-lg bg-[#2ecc71] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#27ae60] transition-colors"
      >
        Install
      </button>
      <button onClick={handleDismiss} className="p-1 text-[#636366] hover:text-white transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
