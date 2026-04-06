'use client';

import { useState } from 'react';
import { Send, Loader2, Plus, X } from 'lucide-react';
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

type Row = {
  id: string;
  title: string;
  description: string;
};

type Section = {
  title: string;
  rows: Row[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber?: string;
  onMessageSent?: () => void;
};

export function InteractiveListDialog({
  open,
  onOpenChange,
  phoneNumber,
  onMessageSent,
}: Props) {
  const [header, setHeader] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [sections, setSections] = useState<Section[]>([
    { title: '', rows: [{ id: 'row_1', title: '', description: '' }] },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSection = () => {
    if (sections.length < 10) {
      setSections([
        ...sections,
        { title: '', rows: [{ id: `row_${Date.now()}`, title: '', description: '' }] },
      ]);
    }
  };

  const handleRemoveSection = (sIdx: number) => {
    if (sections.length > 1) {
      setSections(sections.filter((_, i) => i !== sIdx));
    }
  };

  const handleSectionTitleChange = (sIdx: number, title: string) => {
    const updated = [...sections];
    updated[sIdx].title = title;
    setSections(updated);
  };

  const handleAddRow = (sIdx: number) => {
    const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
    if (totalRows >= 10) return;
    const updated = [...sections];
    updated[sIdx].rows.push({ id: `row_${Date.now()}`, title: '', description: '' });
    setSections(updated);
  };

  const handleRemoveRow = (sIdx: number, rIdx: number) => {
    if (sections[sIdx].rows.length > 1) {
      const updated = [...sections];
      updated[sIdx].rows = updated[sIdx].rows.filter((_, i) => i !== rIdx);
      setSections(updated);
    }
  };

  const handleRowChange = (sIdx: number, rIdx: number, field: 'title' | 'description', value: string) => {
    if (field === 'title' && value.length > 24) return;
    if (field === 'description' && value.length > 72) return;
    const updated = [...sections];
    updated[sIdx].rows[rIdx][field] = value;
    setSections(updated);
  };

  const isValid = () => {
    if (!bodyText.trim()) return false;
    if (!buttonText.trim()) return false;
    return sections.every(
      (s) => s.rows.length > 0 && s.rows.every((r) => r.title.trim())
    );
  };

  const handleReset = () => {
    setHeader('');
    setBodyText('');
    setButtonText('');
    setFooterText('');
    setSections([{ title: '', rows: [{ id: 'row_1', title: '', description: '' }] }]);
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
      const response = await fetch('/api/messages/interactive-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          bodyText: bodyText.trim(),
          buttonText: buttonText.trim(),
          sections: sections.map((s) => ({
            title: s.title.trim() || undefined,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.trim(),
              description: r.description.trim() || undefined,
            })),
          })),
          header: header.trim() || undefined,
          footerText: footerText.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send list message');
      }

      handleReset();
      onOpenChange(false);
      onMessageSent?.();
    } catch (err) {
      console.error('Error sending list message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset(); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send list message</DialogTitle>
          <DialogDescription>
            Create a message with a selectable list menu
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-header" className="text-[var(--wa-text-primary)]">
              Header (optional)
            </Label>
            <Input
              id="list-header"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Add a header"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-body" className="text-[var(--wa-text-primary)]">
              Body <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="list-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Enter your message text"
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)] min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-button" className="text-[var(--wa-text-primary)]">
              Button text <span className="text-red-500">*</span>
            </Label>
            <Input
              id="list-button"
              value={buttonText}
              onChange={(e) => { if (e.target.value.length <= 20) setButtonText(e.target.value); }}
              placeholder="e.g. View options"
              maxLength={20}
              className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)]"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--wa-text-primary)]">
                Sections <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddSection}
                disabled={sections.length >= 10}
                className="h-8 text-[var(--wa-green)] hover:text-[var(--wa-green-dark)] hover:bg-[var(--wa-hover)]"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add section
              </Button>
            </div>

            {sections.map((section, sIdx) => (
              <div key={sIdx} className="border border-[var(--wa-border)] rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(e) => handleSectionTitleChange(sIdx, e.target.value)}
                    placeholder={`Section ${sIdx + 1} title`}
                    className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)] text-sm"
                  />
                  {sections.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSection(sIdx)}
                      className="h-9 w-9 text-[var(--wa-text-secondary)] hover:text-red-500 hover:bg-red-500/10 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {section.rows.map((row, rIdx) => (
                  <div key={row.id} className="flex gap-2 items-start pl-3 border-l-2 border-[var(--wa-border)]">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={row.title}
                        onChange={(e) => handleRowChange(sIdx, rIdx, 'title', e.target.value)}
                        placeholder={`Row ${rIdx + 1} title`}
                        maxLength={24}
                        className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)] text-sm h-8"
                      />
                      <Input
                        value={row.description}
                        onChange={(e) => handleRowChange(sIdx, rIdx, 'description', e.target.value)}
                        placeholder="Description (optional)"
                        maxLength={72}
                        className="bg-[var(--wa-input-bg)] border-[var(--wa-input-ring)] focus-visible:ring-[var(--wa-green)] text-xs h-7"
                      />
                    </div>
                    {section.rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRow(sIdx, rIdx)}
                        className="h-8 w-8 text-[var(--wa-text-secondary)] hover:text-red-500 hover:bg-red-500/10 flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddRow(sIdx)}
                  disabled={totalRows >= 10}
                  className="h-7 text-xs text-[var(--wa-green)] hover:text-[var(--wa-green-dark)] hover:bg-[var(--wa-hover)]"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add row
                </Button>
              </div>
            ))}

            <p className="text-xs text-[var(--wa-text-secondary)]">
              {totalRows}/10 rows used across all sections
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-footer" className="text-[var(--wa-text-primary)]">
              Footer (optional)
            </Label>
            <Input
              id="list-footer"
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
