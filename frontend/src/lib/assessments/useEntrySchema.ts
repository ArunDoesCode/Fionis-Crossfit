'use client';

import { useEffect, useRef } from 'react';
import { entrySchema } from '@/lib/validators/assessments';
import type { EntryForm } from './types';

const NO_MEMBER = { fullName: '', joinedOn: '' };

/**
 * The newest schema of the form. It needs the measurements, which come from the read that needs the date,
 * which is a form field: so the resolver reads the schema from this ref when it runs (only ever after a
 * render, on blur or Save) instead of being built before the data exists.
 */
export function useEntrySchema(data: EntryForm | undefined, today: string) {
  const schema = useRef(entrySchema({ metrics: [], today, member: NO_MEMBER }));
  useEffect(() => {
    schema.current = entrySchema({
      metrics: data?.metrics ?? [],
      today,
      member: data?.member ?? NO_MEMBER,
    });
  }, [data, today]);
  return schema;
}
