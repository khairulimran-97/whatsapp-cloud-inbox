'use client';

import { useState, useRef, useEffect } from 'react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Props = {
  messageId: string;
  phoneNumber: string;
  existingEmoji?: string | null;
  onReacted?: (messageId: string, emoji: string) => void;
};

export function EmojiReactionPicker({ messageId, phoneNumber, existingEmoji, onReacted }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const sendReaction = async (emoji: string) => {
    if (sending) return;
    setSending(true);
    setOpen(false);

    try {
      const finalEmoji = emoji === existingEmoji ? '' : emoji;

      // Optimistic update before API call
      onReacted?.(messageId, finalEmoji);

      const response = await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          messageId,
          emoji: finalEmoji,
        }),
      });

      if (!response.ok) {
        // Revert on failure
        onReacted?.(messageId, existingEmoji || '');
      }
    } catch (err) {
      console.error('Error sending reaction:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 h-7 w-7 flex items-center justify-center rounded-full bg-[var(--wa-panel-bg)] border border-[var(--wa-border)] shadow-sm hover:bg-[var(--wa-hover)] text-[13px]"
        title="React"
      >
        😊
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-[var(--wa-panel-bg)] border border-[var(--wa-border)] rounded-full px-1.5 py-1 shadow-lg animate-in fade-in zoom-in-95 duration-150">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              disabled={sending}
              className={`h-8 w-8 flex items-center justify-center rounded-full text-[18px] hover:bg-[var(--wa-hover)] transition-colors ${
                emoji === existingEmoji ? 'bg-[var(--wa-active)] ring-1 ring-[var(--wa-green)]' : ''
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
