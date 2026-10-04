'use client';

import { useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import SearchField from '@/components/common/SearchField';
import MemberResults from '@/components/pages/members/MemberResults';
import { useMemberList } from '@/lib/api/members/queries';
import { isSearchReady } from '@/lib/members/search';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by members (Stream B): the Home search (BR-REC-07, 140): type 2 letters, the matching members
// appear as rows under the field, tap one to open them. Archived members are not found here (BR-REC-06);
// they are under Members → Archived. Nothing is asked of the server until there are 2 letters.
export default function HomeSearch() {
  const [q, setQ] = useState('');
  const ready = isSearchReady(q);
  const query = useMemberList({ q: q.trim() }, ready);

  return (
    <div className="flex flex-col gap-3">
      <SearchField label={UI_TEXT.searchMembers} value={q} onChange={setQ} />
      {ready && (
        <MemberResults
          query={query}
          skeletonRows={3}
          empty={<EmptyState compact title={`No member matches "${q.trim()}".`} />}
        />
      )}
    </div>
  );
}
