'use client';

import { useState } from 'react';
import type { MemberSearchField } from './directory';
import { activeSearchField } from './searchField';

/**
 * BR-REC-231: the field in use for the typed text and the setter for a manual pick. The pick wins until the
 * text is cleared; then it is forgotten and the next text picks the field again. `initial` seeds a pick kept
 * in the URL.
 */
export function useFieldPick(text: string, initial: MemberSearchField | null = null) {
  const [manual, setManual] = useState<MemberSearchField | null>(initial);
  if (text.trim() === '' && manual !== null) setManual(null);
  return { field: activeSearchField(text, manual), pick: setManual };
}
