'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

interface MonthFieldProps {
  id: string;
  label: string;
  /** `YYYY-MM`, or `''` for none. */
  value: string;
  /** Called with a whole month or `''` (cleared); a half-typed text is not passed on. */
  onChange: (value: string) => void;
}

// A month picker (the phone's own, no library). A browser without one shows a text box, so what is typed
// is kept until it is a whole month; a change of `value` from outside (Back, a bookmark) replaces it.
export default function MonthField({ id, label, value, onChange }: MonthFieldProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="month"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === '' || MONTH.test(next)) onChange(next);
        }}
        className="min-w-0"
      />
    </div>
  );
}
