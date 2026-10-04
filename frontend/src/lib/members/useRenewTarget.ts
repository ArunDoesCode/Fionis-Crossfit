'use client';

import { useCallback, useState } from 'react';

/**
 * Which member's Renew sheet a list shows (one sheet for the whole list, not one per row). `memberId` stays
 * after the sheet closes so the sheet can finish closing with its content; `open` is what shows it.
 */
export function useRenewTarget() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const renew = useCallback((id: string) => {
    setMemberId(id);
    setOpen(true);
  }, []);
  return { memberId, open, renew, onOpenChange: setOpen };
}
