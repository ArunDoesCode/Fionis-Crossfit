'use client';

import { parseAsString } from 'nuqs/server';
import { useEffect, useRef } from 'react';
import { typeFromParam } from './entryParams';

/**
 * `?type=` (the assessment filter, kept so Back returns to the same list) and `?open=` (an assessment to show,
 * from a row of the member page's Recent block) of `/admin/members/[memberId]/assessments` (S11).
 */
export const listParams = {
  type: parseAsString,
  open: parseAsString,
};

/** A well-formed id from the address, else `null` (E27 and E28 answer 400 to anything else). */
export const idFromParam = typeFromParam;

/**
 * `?open=` is an invitation, not a state: it opens the sheet once and is taken out of the address (a
 * `replaceState` on the page's own entry, done before the sheet pushes its own Back entry), so a reload,
 * Back from Edit or a later chip tap never reopens it. A malformed id is dropped without opening anything.
 * The sheet's open state lives with the caller.
 */
export function useOpenParam(open: string | null, onOpen: (assessmentId: string) => void) {
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (open === null) return;
    const assessmentId = idFromParam(open);
    if (assessmentId !== null) onOpenRef.current(assessmentId);
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [open]);
}
