'use client';

import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useRef } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MemberSearchField } from '@/lib/members/directory';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberSearchProps {
  text: string;
  field: MemberSearchField;
  onChange: (text: string) => void;
  onFieldChange: (field: MemberSearchField) => void;
}

// Value -> label, so the trigger shows "Email", not "email".
const FIELDS: Record<MemberSearchField, string> = { name: 'Name', email: 'Email', phone: 'Phone' };

const KEYBOARD = { name: 'search', email: 'email', phone: 'tel' } as const;

// BR-REC-201: the one member search (Home and Members): a dropdown (Name, Email, Phone) joined to the
// search input as one control. Controlled and instant: every key changes `text` at once, nothing waits and
// nothing is asked of the server. Switching the field keeps the text. The keyboard follows the field
// (number pad for phone).
export default function MemberSearch({ text, field, onChange, onFieldChange }: MemberSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <search>
      <Label htmlFor={id} className="sr-only">
        {UI_TEXT.searchMembers}
      </Label>
      <InputGroup className="h-control min-h-11">
        <InputGroupAddon className="h-full self-stretch p-0">
          <Select
            items={FIELDS}
            value={field}
            onValueChange={(next) => {
              if (next) onFieldChange(next as MemberSearchField);
              inputRef.current?.focus();
            }}
          >
            <SelectTrigger
              aria-label="Search by"
              className="h-full min-w-24 rounded-none rounded-l-4xl border-0 border-r bg-transparent pl-4 dark:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {Object.entries(FIELDS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>
        <InputGroupAddon>
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            aria-hidden="true"
            className="size-5"
          />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          ref={inputRef}
          type="search"
          inputMode={KEYBOARD[field]}
          enterKeyHint="search"
          autoComplete="off"
          value={text}
          placeholder={`Search by ${field}`}
          onChange={(event) => onChange(event.target.value)}
        />
        {text !== '' && (
          <InputGroupAddon align="inline-end" className="pr-1">
            <InputGroupButton
              aria-label={UI_TEXT.clearSearch}
              className="size-11"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </search>
  );
}
