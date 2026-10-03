'use client';

import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface SearchFieldProps {
  /** Spoken label ("Search members"); drawn for screen readers, the placeholder shows it to everyone else. */
  label: string;
  /** The committed text (for example the nuqs `q` param). */
  value: string;
  /** Called 250 ms after the last keystroke, on Enter, and at once on clear. Pass a stable callback. */
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export default function SearchField({
  label,
  value,
  onChange,
  placeholder,
  debounceMs = 250,
  className,
}: SearchFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);

  // Follow the committed value when something else changes it (back button, reset).
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, onChange, debounceMs]);

  function clear() {
    setDraft('');
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <search className={cn('relative block', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <HugeiconsIcon
        icon={Search01Icon}
        strokeWidth={2}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={draft}
        placeholder={placeholder ?? label}
        className="pr-12 pl-12"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onChange(draft);
        }}
      />
      {draft !== '' && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={UI_TEXT.clearSearch}
          className="absolute top-1/2 right-1 size-11 -translate-y-1/2"
          onClick={clear}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
        </Button>
      )}
    </search>
  );
}
