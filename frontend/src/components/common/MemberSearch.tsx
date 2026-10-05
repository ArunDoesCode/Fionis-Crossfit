'use client';

import { useId, useRef } from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import type { MemberSearchField } from '@/lib/members/directory';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberSearchProps {
  text: string;
  field: MemberSearchField;
  onChange: (text: string) => void;
  onFieldChange: (field: MemberSearchField) => void;
}

interface FieldItem {
  value: MemberSearchField;
  label: string;
}

const FIELDS: FieldItem[] = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

// The keyboard follows the field (number pad for phone, @ keyboard for email).
const KEYBOARD = { name: 'search', email: 'email', phone: 'tel' } as const;
const PLACEHOLDER = {
  name: 'Search by name',
  email: 'Search by email',
  phone: 'Search by phone',
} as const;

// BR-REC-201: the one member search (Home and Members): a shadcn Combobox (Name, Email, Phone) and a plain
// input side by side. Controlled and instant: every key changes `text` at once, nothing waits and nothing is
// asked of the server. Switching the field keeps the text and moves focus back to the input.
export default function MemberSearch({ text, field, onChange, onFieldChange }: MemberSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);
  const fieldLabel = FIELDS.find((item) => item.value === field)?.label ?? 'Name';

  return (
    <search className="flex items-center gap-2">
      <Combobox
        items={FIELDS}
        value={FIELDS.find((item) => item.value === field) ?? FIELDS[0]}
        onValueChange={(next) => {
          if (!next) return;
          onFieldChange(next.value);
          picked.current = true;
        }}
        // Focus the text input once the list has closed: the combobox returns focus to its own input.
        onOpenChange={(open) => {
          if (open || !picked.current) return;
          picked.current = false;
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <ComboboxInput
          aria-label="Search by"
          readOnly
          showTrigger={false}
          className="h-[var(--control-height)] min-h-11 w-36 shrink-0"
        >
          {/* The ui trigger takes no props: render our own so the icon-only button has a spoken name (BR-REC-137). */}
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              render={<ComboboxTrigger aria-label={`Search by: ${fieldLabel}`} />}
              className="data-pressed:bg-transparent"
            />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxList>
            {(item: FieldItem) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Label htmlFor={id} className="sr-only">
        {UI_TEXT.searchMembers}
      </Label>
      <Input
        id={id}
        ref={inputRef}
        type="search"
        inputMode={KEYBOARD[field]}
        enterKeyHint="search"
        autoComplete="off"
        value={text}
        placeholder={PLACEHOLDER[field]}
        className="h-[var(--control-height)] min-h-11 flex-1"
        onChange={(event) => onChange(event.target.value)}
      />
    </search>
  );
}
