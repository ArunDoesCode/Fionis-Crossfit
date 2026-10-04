'use client';

import { type MutableRefObject, useEffect, useRef, useState } from 'react';

/** How long a complete typed date waits for one more key before it counts (R-6). */
export const DATE_PAUSE_MS = 300;

// A desktop date box reports a complete date after every key of the year: 0002, 0020, 0202, 2026. Only a
// four-digit year from 1000 on can be the finished one; anything else waits for the box to be left.
const settled = (date: string): boolean => {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  return match !== null && Number(match[1]) >= 1000;
};

type Timer = MutableRefObject<ReturnType<typeof setTimeout> | null>;

const stop = (timer: Timer) => {
  if (timer.current !== null) clearTimeout(timer.current);
  timer.current = null;
};

/** What was typed, and the committed date it was typed over (a date that changed meanwhile wins). */
interface Typed {
  text: string;
  base: string;
}

/**
 * The date box shows what is typed at once, but the form only hears about it when the box is left, or when a
 * finished date has stood still for 300 ms (R-6). So the half-typed years of a desktop keyboard never ask the
 * server for a form or move the typed values along. A phone's date picker answers once and passes after the
 * pause. A date that changes from outside (a paper-column chip, "Save & next date", a saved assessment) wins
 * at once and drops what was typed. Put `boxRef` on the element around the date input: it hears the box
 * being left.
 */
export function useDeferredDate(value: string, onCommit: (date: string) => void) {
  const [typed, setTyped] = useState<Typed | null>(null);
  const timer: Timer = useRef(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pending = typed !== null && typed.base === value ? typed : null;

  // The form hears the date only if it is still the one that was typed over (an outside change wins).
  const commit = (entry: Typed) => {
    stop(timer);
    setTyped(null);
    if (entry.base === value && entry.text !== value) onCommit(entry.text);
  };
  // The timer and the focus listener outlive a render: they call the newest `commit`.
  const latest = useRef({ commit, pending });
  useEffect(() => {
    latest.current = { commit, pending };
  });

  useEffect(() => {
    const node = boxRef.current;
    const onLeave = () => {
      const { commit: now, pending: entry } = latest.current;
      if (entry) now(entry);
    };
    node?.addEventListener('focusout', onLeave);
    return () => {
      node?.removeEventListener('focusout', onLeave);
      stop(timer);
    };
  }, []);

  return {
    boxRef,
    shown: pending?.text ?? value,
    change: (text: string) => {
      const entry = { text, base: value };
      setTyped(entry);
      stop(timer);
      if (settled(text)) {
        timer.current = setTimeout(() => latest.current.commit(entry), DATE_PAUSE_MS);
      }
    },
  };
}
