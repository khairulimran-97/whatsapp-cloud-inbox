'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber?: string;
  onMessageSent?: () => void;
};

export function CtaUrlDialog({
  open,
  onOpenChange,
  phoneNumber,
  onMessageSent,
}: Props) {
  const [header, setHeader] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [url, setUrl] = useState('');
  const [footerText, setFooterText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = () => {
    return bodyText.trim() && displayText.trim() && url.trim();
  };

  const handleReset = () => {
    setHeader('');
    setBodyText('');
    setDisplayText('');
    setUrl('');
    setFooterText('');
    setError(null);
  };

  const handleSend = async () => {
    if (!isValid() || !phoneNumber) {
      setError('Please fill in all required fields');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/messages/interactive-cta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          bodyText: bodyText.trim(),
          displayText: displayText.trim(),
          url: url.trim(),
          header: header.trim() || undefined,
          footerText: footerText.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send CTA message');
      }

      handleReset();
      onOpenChange(false);
      onMessageSent?.();
    } catch (err) {
      console.error('Error sending CTA message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Send CTA URL message</DialogTitle>
          <DialogDescription>
            Create a message with a &quot;Visit Website&quot; button
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cta-header" className="text-[var(--wa-text-primary)]">
              Header (optional)
            </Label>
            <Input
              id="cta-header"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Add a header"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta-body" className="text-[var(--wa-text-primary)]">
              Body <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="cta-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Enter your message text"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)] min-h-[80px]"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="cta-url" className="text-[var(--wa-text-primary)]">
              URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cta-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta-display" className="text-[var(--wa-text-primary)]">
              Button text <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cta-display"
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              placeholder="e.g. Visit Website"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta-footer" className="text-[var(--wa-text-primary)]">
              Footer (optional)
            </Label>
            <Input
              id="cta-footer"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Add a footer"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>
        </div>

        <Separator />

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!isValid() || sending}
            className="bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
