'use client';

import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useRef } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MemberSearchField } from '@/lib/members/directory';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberSearchProps {
  text: string;
  field: MemberSearchField;
  onChange: (text: string) => void;
  onFieldChange: (field: MemberSearchField) => void;
}

const FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
] as const;

const KEYBOARD = { name: 'search', email: 'email', phone: 'tel' } as const;

// BR-REC-201: the one member search (Home and Members). Pick what to search by (Name, Email, Phone), then
// type. Controlled and instant: every key changes `text` at once, nothing waits and nothing is asked of the
// server. Switching the field keeps the text. The keyboard follows the field (number pad for phone).
export default function MemberSearch({ text, field, onChange, onFieldChange }: MemberSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <search className="flex flex-col gap-2">
      <ChoiceChips
        legend="Search by"
        hideLegend
        options={FIELDS}
        value={field}
        onChange={onFieldChange}
      />
      <div className="relative">
        <Label htmlFor={id} className="sr-only">
          {UI_TEXT.searchMembers}
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
          inputMode={KEYBOARD[field]}
          enterKeyHint="search"
          autoComplete="off"
          value={text}
          placeholder={`Search by ${field}`}
          className="pr-12 pl-12"
          onChange={(event) => onChange(event.target.value)}
        />
        {text !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={UI_TEXT.clearSearch}
            className="absolute top-1/2 right-1 size-11 -translate-y-1/2"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
          </Button>
        )}
      </div>
    </search>
  );
}
