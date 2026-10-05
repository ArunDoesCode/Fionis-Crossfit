'use client';

import { type ComponentProps, useMemo, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import MemberSearch from '@/components/common/MemberSearch';
import MemberDirectoryResults from '@/components/pages/members/MemberDirectoryResults';
import { useMemberDirectory } from '@/lib/api/members/queries';
import { foldText, MIN_SEARCH_CHARS, searchMembers } from '@/lib/members/directory';

// SLOT owned by members (Stream B): the Home search (BR-REC-07, 140, 201, 204): pick Name, Email or Phone,
// type 2 letters, the matching members appear as rows under the field, tap one to open them. Archived
// members are not found here (BR-REC-06); they are under Members → Archived. Text and field live in state
// only. The results area keeps a minimum height so the page does not jump when rows arrive (BR-REC-143).
export default function HomeSearch() {
  const [text, setText] = useState('');
  const [field, setField] = useState<ComponentProps<typeof MemberSearch>['field']>('name');
  const { data, isError, refetch } = useMemberDirectory();
  const rows = useMemo(
    () => data && searchMembers(data, { text, field, archived: false }),
    [data, text, field],
  );
  const ready = foldText(text).length >= MIN_SEARCH_CHARS;

  return (
    <div className="flex flex-col gap-3">
      <MemberSearch text={text} field={field} onChange={setText} onFieldChange={setField} />
      {ready && (
        <div className="min-h-48">
          <MemberDirectoryResults
            rows={rows}
            isError={isError}
            onRetry={() => void refetch()}
            skeletonRows={3}
            empty={<EmptyState compact title={`No member matches "${text.trim()}".`} />}
          />
        </div>
      )}
    </div>
  );
}
